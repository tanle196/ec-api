import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import Big from 'big.js';
import { amountForUnits } from '@/common/utils/allocation.util';
import { Order } from '@/orders/entities/order.entity';
import { OrderStatus } from '@/orders/enums/order-status.enum';
import { OrderStatusChangeActor } from '@/orders/enums/order-status-change-actor.enum';
import { OrdersService } from '@/orders/orders.service';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { toMoney } from '@/common/utils/money.util';
import { OrderItem } from '@/orders/entities/order-item.entity';
import { TypedConfigService } from '@/config/TypedConfigService';
import { CodSettlementDto } from './dto/cod-settlement.dto';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateRefundDto } from './dto/create-refund.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { Payment } from './entities/payment.entity';
import { Refund } from './entities/refund.entity';
import { RefundItem } from './entities/refund-item.entity';
import { PaymentStatus } from './enums/payment-status.enum';
import { PaymentIssueType } from './enums/payment-issue-type.enum';
import { PaymentMethod } from './enums/payment-method.enum';
import { RefundStatus } from './enums/refund-status.enum';
import { PaymentInitiationContext } from './gateways/payment-gateway.interface';
import { PaymentGatewayRegistry } from './gateways/payment-gateway.registry';
import { fromStripeAmount } from './gateways/stripe/stripe-currency.util';
import { PaymentIssuesService } from './payment-issues.service';
import { PaymentPolicy } from './policies/payment.policy';

type GatewayEventOutcome = 'processed' | 'already_terminal' | 'not_found';

export type CodSettlementResult =
  | 'settled'
  | 'already_settled'
  | 'amount_mismatch'
  | 'not_delivered'
  | 'no_cod_payment'
  | 'order_not_found';

export interface CodSettlementSummary {
  reference: string;
  settled: number;
  needsAttention: number;
  lines: {
    orderNumber: string;
    result: CodSettlementResult;
    message?: string;
  }[];
}

// Captured from applyStatusChange(..., manager) so the resulting
// status-change email can be sent after our own transaction has committed,
// instead of from inside applyStatusChange where it'd risk firing for a
// change that later rolls back — see applyStatusChange's doc comment.
type OrderStatusNotify = {
  order: Order;
  fromStatus: OrderStatus | null;
} | null;

// Refunds that are either already confirmed by the gateway (SUCCEEDED) or
// still awaiting confirmation (PENDING) are both treated as "committed"
// against the payment's balance/item quantities — a PENDING refund is
// actively in flight for some request and must not be double-spent by a
// concurrent one. FAILED refunds release their reservation automatically by
// being excluded here.
const COMMITTED_REFUND_STATUSES = [
  RefundStatus.PENDING,
  RefundStatus.SUCCEEDED,
];

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Refund)
    private readonly refundRepo: Repository<Refund>,
    private readonly dataSource: DataSource,
    private readonly ordersService: OrdersService,
    private readonly gatewayRegistry: PaymentGatewayRegistry,
    private readonly paymentPolicy: PaymentPolicy,
    private readonly issuesService: PaymentIssuesService,
    private readonly configService: TypedConfigService,
  ) {}

  async create(
    userId: string,
    dto: CreatePaymentDto,
    context: PaymentInitiationContext = {},
  ): Promise<Payment> {
    const provider = this.gatewayRegistry.resolve(dto.method);
    this.paymentPolicy.assertMethodAvailable(dto.method, Boolean(provider));

    // Lock the order row for the duration of the "any active payment
    // already exists?" check and the insert that follows, so two concurrent
    // create() calls for the same order (double-click, retried request)
    // serialize instead of both reading no active payment and both
    // inserting one. The gateway call happens after this transaction
    // commits and releases the lock, so it never holds it during network
    // I/O.
    const { payment, order } = await this.dataSource.transaction(
      async (manager) => {
        const order = await manager.findOne(Order, {
          where: { id: dto.order_id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!order) throw new NotFoundException('Order not found');
        this.paymentPolicy.assertOrderOwnedBy(order, userId);
        this.paymentPolicy.assertOrderPayable(order);
        if (dto.method === PaymentMethod.COD) {
          this.paymentPolicy.assertCodAllowed(
            order,
            this.configService.getAppConfig().codMaxOrderTotal,
          );
        }

        // PARTIALLY_REFUNDED is included alongside PENDING/COMPLETED: it's
        // still the order's "active" payment (money was collected, only
        // part of it was returned) and must not be superseded by a brand
        // new full-amount Payment for the same order.
        const existingActive = await manager.findOne(Payment, {
          where: [
            { order_id: dto.order_id, status: PaymentStatus.PENDING },
            { order_id: dto.order_id, status: PaymentStatus.COMPLETED },
            {
              order_id: dto.order_id,
              status: PaymentStatus.PARTIALLY_REFUNDED,
            },
          ],
        });

        if (existingActive) {
          throw new BadRequestException(
            'An active payment already exists for this order',
          );
        }

        const payment = await manager.save(
          Payment,
          manager.create(Payment, {
            order_id: dto.order_id,
            method: dto.method,
            status: PaymentStatus.PENDING,
            amount: order.total,
          }),
        );

        return { payment, order };
      },
    );

    if (!provider) return payment;

    try {
      const result = await provider.initiate(payment, order, context);
      payment.transactionId = result.providerRef;
      payment.metadata = {
        ...(payment.metadata ?? {}),
        ...(result.metadata ?? {}),
        checkoutUrl: result.redirectUrl ?? null,
      };

      return await this.paymentRepo.save(payment);
    } catch (error) {
      // The PENDING payment row was already committed above (phase 1), so
      // leaving it PENDING here would permanently trip the "active payment
      // already exists" check in phase 1 on retry, with no checkoutUrl for
      // the customer to fall back on. Mark it FAILED so a retried create()
      // for this order isn't blocked by a payment that never actually
      // reached the gateway.
      try {
        payment.status = PaymentStatus.FAILED;
        await this.paymentRepo.save(payment);
      } catch (saveError) {
        this.logger.error(
          `Failed to mark payment ${payment.id} FAILED after initiate() error`,
          saveError instanceof Error ? saveError.stack : saveError,
        );
      }
      throw error;
    }
  }

  async findAll(
    query: PaymentQueryDto,
    requesterId?: string,
    isAdmin = false,
  ): Promise<PaginatedResponseDto<Payment>> {
    const { page = 1, limit = 20, status, order_id, user_id } = query;

    const qb = this.paymentRepo
      .createQueryBuilder('p')
      .leftJoin('p.order', 'o');

    if (!isAdmin) {
      qb.andWhere('o.user_id = :userId', { userId: requesterId });
    } else if (user_id) {
      qb.andWhere('o.user_id = :userId', { userId: user_id });
    }

    if (status) qb.andWhere('p.status = :status', { status });
    if (order_id) qb.andWhere('p.order_id = :order_id', { order_id });

    const [data, total] = await qb
      .orderBy('p.createdAt', 'DESC')
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  async findOne(id: string, userId?: string): Promise<Payment> {
    const payment = await this.paymentRepo.findOne({
      where: { id },
      relations: ['order'],
    });

    if (!payment) throw new NotFoundException('Payment not found');
    if (userId) this.paymentPolicy.assertOrderOwnedBy(payment.order, userId);

    return payment;
  }

  async findByTransactionId(transactionId: string): Promise<Payment | null> {
    return this.paymentRepo.findOne({ where: { transactionId } });
  }

  async updateStatus(
    id: string,
    dto: UpdatePaymentStatusDto,
    actorId?: string,
  ): Promise<Payment> {
    this.paymentPolicy.assertStatusAssignable(dto.status);

    // Locks the payment row so this read-check-write can't interleave with
    // a concurrent webhook event (completeFromGatewayEvent/
    // failFromGatewayEvent) touching the same payment, and folds the order
    // status sync into the same transaction so the two writes commit or
    // roll back together.
    return this.commitAndNotify<Payment>(async (manager) => {
      const payment = await this.lockPayment(manager, id);
      if (!payment) throw new NotFoundException('Payment not found');

      this.paymentPolicy.assertNotTerminal(payment);

      payment.status = dto.status;

      if (dto.transactionId !== undefined) {
        payment.transactionId = dto.transactionId;
      }
      if (dto.metadata !== undefined) {
        payment.metadata = dto.metadata;
      }

      let orderNotify: OrderStatusNotify = null;

      if (dto.status === PaymentStatus.COMPLETED) {
        payment.paidAt = new Date();
        const { outcome, order, fromStatus } =
          await this.ordersService.confirmAfterPayment(
            payment.order_id,
            {
              actorType: OrderStatusChangeActor.ADMIN,
              actorId,
              note: 'Payment completed',
            },
            manager,
          );
        // A person marking it paid can refund it themselves; don't record
        // money against an order we can no longer fulfil.
        this.paymentPolicy.assertOrderFulfillable(outcome);
        orderNotify = { order, fromStatus };
      }

      return { result: await manager.save(Payment, payment), orderNotify };
    });
  }

  /**
   * The gateway captured the money. Marks the payment COMPLETED and moves
   * the order on (confirmAfterPayment). Two cases need more than that and
   * are handled after the commit:
   * - The order was cancelled (expired, or cancelled by the customer) and
   *   its stock is gone: the money is refunded in full automatically and an
   *   issue is raised so someone tells the customer.
   * - The gateway captured a different amount than the order now costs
   *   (`capturedAmount`, when the gateway reports it): an issue is raised.
   */
  async completeFromGatewayEvent(
    paymentId: string,
    transactionId: string,
    metadata: Record<string, unknown>,
    note: string,
    capturedAmount?: number,
  ): Promise<GatewayEventOutcome> {
    // Locked read-check-write: gateways can redeliver or race webhook
    // events, so without a lock a delayed/duplicate event could interleave
    // with another one on the same payment and both would read the same
    // pre-update status. Folding the order sync into the same transaction
    // also keeps payment and order status from diverging.
    const { outcome, followUp } = await this.commitAndNotify<{
      outcome: GatewayEventOutcome;
      followUp: {
        payment: Payment;
        orderTotal: number;
        needsRefund: boolean;
      } | null;
    }>(async (manager) => {
      const payment = await this.lockPayment(manager, paymentId);
      if (!payment) {
        return {
          result: { outcome: 'not_found', followUp: null },
          orderNotify: null,
        };
      }
      if (this.paymentPolicy.isTerminal(payment.status)) {
        return {
          result: { outcome: 'already_terminal', followUp: null },
          orderNotify: null,
        };
      }

      // Merged, not replaced: gateways keep data here that later calls
      // need (e.g. VNPay's transaction date for refunds).
      payment.status = PaymentStatus.COMPLETED;
      payment.transactionId = transactionId;
      payment.metadata = { ...(payment.metadata ?? {}), ...metadata };
      payment.paidAt = new Date();
      await manager.save(Payment, payment);

      const confirmed = await this.ordersService.confirmAfterPayment(
        payment.order_id,
        { actorType: OrderStatusChangeActor.SYSTEM, note },
        manager,
      );

      return {
        result: {
          outcome: 'processed',
          followUp: {
            payment,
            orderTotal: Number(confirmed.order.total),
            needsRefund: confirmed.outcome === 'not_revivable',
          },
        },
        orderNotify: {
          order: confirmed.order,
          fromStatus: confirmed.fromStatus,
        },
      };
    });

    if (followUp) {
      const captured = capturedAmount ?? Number(followUp.payment.amount);
      if (!this.paymentPolicy.amountsMatch(captured, followUp.orderTotal)) {
        await this.issuesService.raise({
          type: PaymentIssueType.AMOUNT_MISMATCH,
          paymentId,
          orderId: followUp.payment.order_id,
          method: followUp.payment.method,
          summary: `Gateway captured ${captured}, order total is ${followUp.orderTotal}`,
          details: { captured, orderTotal: followUp.orderTotal },
        });
      }
      if (followUp.needsRefund) {
        await this.refundLatePayment(followUp.payment);
      }
    }

    return outcome;
  }

  async failFromGatewayEvent(
    paymentId: string,
    metadata: Record<string, unknown>,
  ): Promise<GatewayEventOutcome> {
    // See completeFromGatewayEvent — same locked read-check-write to stay
    // safe against redelivered/racing webhook events on the same payment.
    // No order sync happens here, so this doesn't go through
    // commitAndNotify — there's nothing to notify after commit.
    return this.dataSource.transaction(async (manager) => {
      const payment = await this.lockPayment(manager, paymentId);
      if (!payment) return 'not_found';
      if (this.paymentPolicy.isTerminal(payment.status)) {
        return 'already_terminal';
      }

      payment.status = PaymentStatus.FAILED;
      payment.metadata = { ...(payment.metadata ?? {}), ...metadata };
      await manager.save(Payment, payment);

      return 'processed';
    });
  }

  /**
   * Handles refunds confirmed by the gateway that didn't originate from
   * `createRefund` (e.g. issued directly from the Stripe dashboard). Uses
   * the charge's running refunded total to stay partial-refund aware, and
   * is idempotent against refunds we already recorded ourselves.
   */
  async refundFromGatewayEvent(
    paymentId: string,
    charge: Record<string, unknown>,
    note: string,
  ): Promise<GatewayEventOutcome> {
    // Locked read-check-write, same reasoning as completeFromGatewayEvent —
    // also guards against racing/overlapping with createRefund on the same
    // payment (both ultimately write payment.status and a Refund row).
    return this.commitAndNotify<GatewayEventOutcome>(async (manager) => {
      const payment = await this.lockPayment(manager, paymentId);
      if (!payment) {
        return { result: 'not_found', orderNotify: null };
      }
      // Unlike the sibling gateway-event handlers, this one deliberately
      // doesn't block on the full terminal-status set — COMPLETED
      // and PARTIALLY_REFUNDED are exactly the states a further dashboard
      // refund is expected to move on from. But it must still reject a
      // payment that was never actually marked paid (PENDING/FAILED): an
      // out-of-order or lost checkout.session.completed event could
      // otherwise let this handler mark a never-paid payment REFUNDED
      // directly, with paidAt never set and no completed charge behind it.
      if (!this.paymentPolicy.isRefundable(payment.status)) {
        return { result: 'already_terminal', orderNotify: null };
      }

      const latestRefundId = this.extractLatestRefundId(charge);
      if (latestRefundId) {
        const alreadyRecorded = await manager.findOne(Refund, {
          where: { transactionId: latestRefundId },
        });
        if (alreadyRecorded) {
          return { result: 'already_terminal', orderNotify: null };
        }
      }

      // charge.amount/amount_refunded are in Stripe's integer
      // smallest-unit format (e.g. cents), not the app's decimal amounts
      // — comparing them directly against payment.amount/our own refund
      // sums (both decimal) would be off by 100x for any non-zero-decimal
      // currency. Convert using the charge's own currency rather than the
      // configured default, since that's the currency the charge actually
      // happened in. The payment.amount fallback is skipped here — it's
      // already decimal, not a Stripe unit, so it must NOT go through
      // fromStripeAmount too.
      const currency =
        typeof charge.currency === 'string' ? charge.currency : '';
      const amountTotal =
        typeof charge.amount === 'number'
          ? fromStripeAmount(charge.amount, currency)
          : Number(payment.amount);
      const amountRefundedTotal = fromStripeAmount(
        Number(charge.amount_refunded ?? 0),
        currency,
      );
      const alreadyRefunded = await this.sumRefundAmount(manager, paymentId, [
        RefundStatus.SUCCEEDED,
      ]);
      const newAmount = toMoney(
        new Big(amountRefundedTotal).minus(alreadyRefunded),
      );
      if (newAmount <= 0) {
        return { result: 'already_terminal', orderNotify: null };
      }

      await manager.save(
        Refund,
        manager.create(Refund, {
          payment_id: payment.id,
          order_id: payment.order_id,
          amount: newAmount,
          reason: note,
          status: RefundStatus.SUCCEEDED,
          transactionId: latestRefundId,
          metadata: charge,
        }),
      );

      payment.status =
        amountRefundedTotal >= amountTotal
          ? PaymentStatus.REFUNDED
          : PaymentStatus.PARTIALLY_REFUNDED;
      await manager.save(Payment, payment);

      const orderNotify = await this.ordersService.applyStatusChange(
        payment.order_id,
        payment.status === PaymentStatus.REFUNDED
          ? OrderStatus.REFUNDED
          : OrderStatus.PARTIALLY_REFUNDED,
        { actorType: OrderStatusChangeActor.SYSTEM, note },
        manager,
      );

      return { result: 'processed', orderNotify };
    });
  }

  /**
   * Validates that the requested items are refundable (not exceeding the
   * order item's remaining quantity or the payment's remaining balance) and
   * computes the resulting refund amount. `extraReservedQtyByItem` lets
   * callers (e.g. refund requests awaiting approval) fold in quantities that
   * aren't refunded yet but shouldn't be double-committed either.
   *
   * Must be called with a transactional `manager` that already holds (or is
   * about to take) a pessimistic lock on the payment row — see the lock
   * acquired just above each call site. Without that lock, two concurrent
   * callers could both read the same "already committed" total/quantities
   * before either writes its own refund, and both would pass this check.
   */
  async resolveRefundableItems(
    manager: EntityManager,
    paymentId: string,
    items: { order_item_id: string; quantity: number }[],
    extraReservedQtyByItem?: Map<string, number>,
  ): Promise<{
    payment: Payment;
    itemsToCreate: Partial<RefundItem>[];
    amount: number;
  }> {
    const payment = await manager.findOne(Payment, {
      where: { id: paymentId },
      relations: ['order', 'order.items'],
    });
    if (!payment) throw new NotFoundException('Payment not found');

    this.paymentPolicy.assertRefundable(payment);

    const orderItemsById = new Map<string, OrderItem>(
      payment.order.items.map((item) => [item.id, item]),
    );

    this.paymentPolicy.assertNoDuplicateRefundItems(items);

    const committedQtyByItem = await this.getRefundQuantitiesByItem(
      manager,
      paymentId,
      COMMITTED_REFUND_STATUSES,
    );

    // Each order item carries what the customer actually paid for it
    // (paidAmount = total - its share of the discount + its share of
    // shipping), fixed when the order was placed. Those sum to exactly
    // order.total = payment.amount, so refunding every unit of every item
    // reconciles to the full payment, and a scoped discount only reduces the
    // refund of the lines it actually discounted.
    //
    // Units are priced as a slice of the line after everything already
    // committed or reserved on it, so refunding a line in several goes
    // adds back up to exactly its paidAmount instead of drifting by the
    // rounding of each partial refund.
    let amount = new Big(0);
    const itemsToCreate: Partial<RefundItem>[] = [];

    for (const reqItem of items) {
      const orderItem = orderItemsById.get(reqItem.order_item_id);
      if (!orderItem) {
        throw new BadRequestException(
          `Order item ${reqItem.order_item_id} does not belong to this order`,
        );
      }

      const committedQty = committedQtyByItem.get(orderItem.id) ?? 0;
      const reservedQty = extraReservedQtyByItem?.get(orderItem.id) ?? 0;
      const refundableQty = orderItem.quantity - committedQty - reservedQty;
      this.paymentPolicy.assertRefundQuantityAvailable(
        orderItem.productName,
        reqItem.quantity,
        refundableQty,
      );

      const alreadyTaken = committedQty + reservedQty;
      const itemAmount = amountForUnits(
        Number(orderItem.paidAmount),
        orderItem.quantity,
        alreadyTaken,
        alreadyTaken + reqItem.quantity,
      );
      amount = amount.plus(itemAmount);

      itemsToCreate.push({
        order_item_id: orderItem.id,
        quantity: reqItem.quantity,
        amount: itemAmount,
      });
    }

    const committedTotal = await this.sumRefundAmount(
      manager,
      paymentId,
      COMMITTED_REFUND_STATUSES,
    );
    this.paymentPolicy.assertWithinRefundableBalance(
      committedTotal,
      amount,
      Number(payment.amount),
    );

    return { payment, itemsToCreate, amount: amount.toNumber() };
  }

  async createRefund(
    paymentId: string,
    dto: CreateRefundDto,
    actorId?: string,
  ): Promise<Refund> {
    // Phase 1 — validate + reserve. Locks the payment row for the balance/
    // quantity check and the PENDING refund insert, so a concurrent
    // createRefund/refund-request approval for the same payment can't
    // interleave and both pass the same balance check. The lock is released
    // as soon as this transaction commits, before the (potentially slow)
    // gateway call below.
    const { refund, payment, amount } = await this.dataSource.transaction(
      async (manager) => {
        await this.lockPayment(manager, paymentId);

        const { payment, itemsToCreate, amount } =
          await this.resolveRefundableItems(manager, paymentId, dto.items);

        const refund = await manager.save(
          Refund,
          manager.create(Refund, {
            payment_id: payment.id,
            order_id: payment.order_id,
            amount,
            reason: dto.reason,
            status: RefundStatus.PENDING,
            actorId: actorId ?? null,
            items: itemsToCreate as RefundItem[],
          }),
        );

        return { refund, payment, amount };
      },
    );

    // Phase 2 — call the gateway outside any lock/transaction (network I/O).
    const provider = this.gatewayRegistry.resolve(payment.method);
    let gatewayError: Error | undefined;
    try {
      if (provider?.refund) {
        // refund.id is stable for the lifetime of this Refund row (created
        // just above, before the gateway call) — see the interface's doc
        // comment for why this protects against a double real refund.
        const result = await provider.refund(
          payment,
          amount,
          dto.reason,
          refund.id,
        );
        refund.transactionId = result.providerRef;
        refund.metadata = result.raw ?? null;
      }
      refund.status = RefundStatus.SUCCEEDED;
    } catch (error) {
      gatewayError = error instanceof Error ? error : new Error(String(error));
      refund.status = RefundStatus.FAILED;
      refund.metadata = { error: gatewayError.message };
    }

    // Phase 3 — settle. Re-locks the payment row so the refund status write,
    // the payment status write, and the order status sync commit together
    // and stay consistent with other concurrent settlements (webhook
    // events, other refunds) on the same payment.
    await this.commitAndNotify<undefined>(async (manager) => {
      await manager.save(Refund, refund);

      if (gatewayError) return { result: undefined, orderNotify: null };

      // Use the freshly locked row as the base for the mutation, not the
      // `payment` object captured back in Phase 1 — that snapshot predates
      // the (potentially slow) gateway call in Phase 2, so saving it back
      // as-is would silently revert any field a concurrent settlement wrote
      // to this payment in between.
      const lockedPayment = await this.lockPayment(manager, payment.id);
      if (!lockedPayment) throw new NotFoundException('Payment not found');

      const succeededTotal = await this.sumRefundAmount(manager, paymentId, [
        RefundStatus.SUCCEEDED,
      ]);
      lockedPayment.status =
        succeededTotal >= Number(lockedPayment.amount)
          ? PaymentStatus.REFUNDED
          : PaymentStatus.PARTIALLY_REFUNDED;
      await manager.save(Payment, lockedPayment);

      const orderNotify = await this.ordersService.applyStatusChange(
        lockedPayment.order_id,
        lockedPayment.status === PaymentStatus.REFUNDED
          ? OrderStatus.REFUNDED
          : OrderStatus.PARTIALLY_REFUNDED,
        {
          actorType: OrderStatusChangeActor.ADMIN,
          actorId,
          note: `Refund: ${dto.reason}`,
        },
        manager,
      );

      return { result: undefined, orderNotify };
    });

    if (gatewayError) throw gatewayError;

    const created = await this.refundRepo.findOne({
      where: { id: refund.id },
    });
    if (!created) throw new NotFoundException('Refund not found');
    return created;
  }

  /**
   * Books a carrier's COD remittance statement. Each line is settled in its
   * own transaction, so one bad line doesn't hold back the rest; lines that
   * don't add up are left unpaid and raised as issues.
   */
  async settleCod(
    dto: CodSettlementDto,
    actorId: string,
  ): Promise<CodSettlementSummary> {
    const lines: CodSettlementSummary['lines'] = [];

    for (const line of dto.lines) {
      const { result, message } = await this.settleCodLine(line, dto, actorId);
      lines.push({ orderNumber: line.orderNumber, result, message });
    }

    return {
      reference: dto.reference,
      settled: lines.filter((l) => l.result === 'settled').length,
      needsAttention: lines.filter(
        (l) => !['settled', 'already_settled'].includes(l.result),
      ).length,
      lines,
    };
  }

  private async settleCodLine(
    line: CodSettlementDto['lines'][number],
    dto: CodSettlementDto,
    actorId: string,
  ): Promise<{ result: CodSettlementResult; message?: string }> {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { orderNumber: line.orderNumber },
      });
      if (!order) return { result: 'order_not_found' as const };

      const candidate = await manager.findOne(Payment, {
        where: [
          {
            order_id: order.id,
            method: PaymentMethod.COD,
            status: PaymentStatus.PENDING,
          },
          {
            order_id: order.id,
            method: PaymentMethod.COD,
            status: PaymentStatus.COMPLETED,
          },
        ],
        order: { createdAt: 'DESC' },
      });
      if (!candidate) return { result: 'no_cod_payment' as const };

      const payment = await this.lockPayment(manager, candidate.id);
      if (!payment) return { result: 'no_cod_payment' as const };
      if (payment.status === PaymentStatus.COMPLETED) {
        return { result: 'already_settled' as const };
      }

      const check = this.paymentPolicy.checkCodSettlement(
        order,
        payment,
        line.amount,
      );
      if (check !== 'ok') {
        const type =
          check === 'not_delivered'
            ? PaymentIssueType.COD_NOT_DELIVERED
            : PaymentIssueType.COD_AMOUNT_MISMATCH;
        const message =
          check === 'not_delivered'
            ? `Carrier remitted COD but the order is "${order.status}"`
            : `Carrier remitted ${line.amount}, payment is ${payment.amount}`;
        await this.issuesService.raise(
          {
            type,
            paymentId: payment.id,
            orderId: order.id,
            method: PaymentMethod.COD,
            summary: message,
            details: {
              reference: dto.reference,
              carrier: dto.carrier ?? null,
              remitted: line.amount,
              expected: Number(payment.amount),
              orderStatus: order.status,
            },
          },
          manager,
        );
        return { result: check, message };
      }

      payment.status = PaymentStatus.COMPLETED;
      payment.paidAt = new Date();
      payment.metadata = {
        ...(payment.metadata ?? {}),
        codSettlement: {
          reference: dto.reference,
          carrier: dto.carrier ?? null,
          amount: line.amount,
          settledBy: actorId,
          settledAt: new Date().toISOString(),
        },
      };
      await manager.save(Payment, payment);
      // Earlier statements that didn't add up are settled by this one.
      await this.issuesService.resolveOpen(
        payment.id,
        [
          PaymentIssueType.COD_AMOUNT_MISMATCH,
          PaymentIssueType.COD_NOT_DELIVERED,
        ],
        `Settled by COD statement ${dto.reference}`,
        actorId,
        manager,
      );
      return { result: 'settled' as const };
    });
  }

  // Full refund of a payment that arrived after its order was cancelled and
  // the stock was gone. Raised as an issue either way: the customer needs to
  // hear about it, and a failed refund needs doing by hand.
  private async refundLatePayment(payment: Payment): Promise<void> {
    const items = await this.dataSource.manager.find(OrderItem, {
      where: { order_id: payment.order_id },
    });
    const reason =
      'Payment received after the order was cancelled; items no longer in stock';

    try {
      const refund = await this.createRefund(payment.id, {
        items: items.map((i) => ({
          order_item_id: i.id,
          quantity: i.quantity,
        })),
        reason,
      });
      await this.issuesService.raise({
        type: PaymentIssueType.LATE_PAYMENT_REFUNDED,
        paymentId: payment.id,
        orderId: payment.order_id,
        method: payment.method,
        summary: `Late payment refunded automatically (${refund.amount}); let the customer know`,
        details: { refundId: refund.id, amount: refund.amount },
      });
    } catch (error) {
      this.logger.error(
        `Automatic refund of late payment ${payment.id} failed`,
        error instanceof Error ? error.stack : error,
      );
      await this.issuesService.raise({
        type: PaymentIssueType.LATE_PAYMENT_REFUND_FAILED,
        paymentId: payment.id,
        orderId: payment.order_id,
        method: payment.method,
        summary:
          'Late payment on a cancelled order could not be refunded automatically; refund it by hand',
        details: {
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  async findRefunds(paymentId: string): Promise<Refund[]> {
    return this.refundRepo.find({
      where: { payment_id: paymentId },
      order: { createdAt: 'DESC' },
    });
  }

  // Shared pessimistic-lock read used by every method that mutates a
  // Payment row, so the lock acquisition itself can't drift out of sync
  // between call sites. Returns null (rather than throwing) so callers that
  // treat a missing payment as a valid outcome (e.g. gateway webhook
  // handlers returning 'not_found' instead of a 500) stay in control of
  // that decision.
  private async lockPayment(
    manager: EntityManager,
    paymentId: string,
  ): Promise<Payment | null> {
    return manager.findOne(Payment, {
      where: { id: paymentId },
      lock: { mode: 'pessimistic_write' },
    });
  }

  // Runs `work` inside a transaction, then — only once that transaction has
  // actually committed — fires the order-status-change notification it
  // captured via ordersService.applyStatusChange(..., manager), if any.
  // Centralizes the "commit first, notify after" pattern every method here
  // that folds an order status sync into its own payment transaction must
  // follow; see applyStatusChange's doc comment for why notifying can't
  // happen inline from inside `work`.
  private async commitAndNotify<T>(
    work: (
      manager: EntityManager,
    ) => Promise<{ result: T; orderNotify: OrderStatusNotify }>,
  ): Promise<T> {
    const { result, orderNotify } = await this.dataSource.transaction(work);

    if (orderNotify) {
      this.ordersService.notifyOrderStatusChanged(
        orderNotify.order,
        orderNotify.fromStatus,
      );
    }

    return result;
  }

  private async getRefundQuantitiesByItem(
    manager: EntityManager,
    paymentId: string,
    statuses: RefundStatus[],
  ): Promise<Map<string, number>> {
    const refunds = await manager.find(Refund, {
      where: { payment_id: paymentId, status: In(statuses) },
    });

    const qtyByItem = new Map<string, number>();
    for (const refund of refunds) {
      for (const item of refund.items) {
        qtyByItem.set(
          item.order_item_id,
          (qtyByItem.get(item.order_item_id) ?? 0) + item.quantity,
        );
      }
    }
    return qtyByItem;
  }

  private async sumRefundAmount(
    manager: EntityManager,
    paymentId: string,
    statuses: RefundStatus[],
  ): Promise<number> {
    const result = await manager
      .createQueryBuilder(Refund, 'r')
      .select('COALESCE(SUM(r.amount), 0)', 'total')
      .where('r.payment_id = :paymentId', { paymentId })
      .andWhere('r.status IN (:...statuses)', { statuses })
      .getRawOne<{ total: string }>();
    return Number(result?.total ?? 0);
  }

  private extractLatestRefundId(
    charge: Record<string, unknown>,
  ): string | null {
    const refunds = charge.refunds as { data?: { id: string }[] } | undefined;
    return refunds?.data?.[0]?.id ?? null;
  }
}
