import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository } from 'typeorm';
import Big from 'big.js';
import { Order } from '@/orders/entities/order.entity';
import { OrderStatus } from '@/orders/enums/order-status.enum';
import { OrderStatusChangeActor } from '@/orders/enums/order-status-change-actor.enum';
import { OrdersService } from '@/orders/orders.service';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { MONEY_DECIMAL_PLACES, toMoney } from '@/common/utils/money.util';
import { OrderItem } from '@/orders/entities/order-item.entity';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { CreateRefundDto } from './dto/create-refund.dto';
import { PaymentQueryDto } from './dto/payment-query.dto';
import { UpdatePaymentStatusDto } from './dto/update-payment-status.dto';
import { Payment } from './entities/payment.entity';
import { Refund } from './entities/refund.entity';
import { RefundItem } from './entities/refund-item.entity';
import { PaymentStatus } from './enums/payment-status.enum';
import { RefundStatus } from './enums/refund-status.enum';
import { PaymentGatewayRegistry } from './gateways/payment-gateway.registry';
import { fromStripeAmount } from './gateways/stripe/stripe-currency.util';

type GatewayEventOutcome = 'processed' | 'already_terminal' | 'not_found';

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

// A payment in any of these statuses has already been settled one way or
// another (paid in full, or resolved via the refund flow) and must not be
// mutated by updateStatus/completeFromGatewayEvent/failFromGatewayEvent —
// kept as one shared list so the three call sites can't drift out of sync.
const TERMINAL_PAYMENT_STATUSES = [
  PaymentStatus.COMPLETED,
  PaymentStatus.PARTIALLY_REFUNDED,
  PaymentStatus.REFUNDED,
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
  ) {}

  async create(userId: string, dto: CreatePaymentDto): Promise<Payment> {
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
        if (order.user_id !== userId) throw new ForbiddenException();

        if (
          order.status === OrderStatus.CANCELLED ||
          order.status === OrderStatus.REFUNDED
        ) {
          throw new BadRequestException(
            `Cannot pay for an order with status "${order.status}"`,
          );
        }

        const existingActive = await manager.findOne(Payment, {
          where: [
            { order_id: dto.order_id, status: PaymentStatus.PENDING },
            { order_id: dto.order_id, status: PaymentStatus.COMPLETED },
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

    const provider = this.gatewayRegistry.resolve(dto.method);
    if (!provider) return payment;

    try {
      const result = await provider.initiate(payment, order);
      payment.transactionId = result.providerRef;
      payment.metadata = {
        ...(payment.metadata ?? {}),
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
    if (userId && payment.order.user_id !== userId)
      throw new ForbiddenException();

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
    // partially_refunded/refunded are system-derived statuses: they're only
    // ever set by createRefund/refundFromGatewayEvent alongside an actual
    // Refund record, the corresponding gateway call, and the matching order
    // sync. Allowing an admin to set either directly here would let a payment
    // claim to be (partially) refunded with no money actually returned and no
    // Refund row behind it — and since resolveRefundableItems only allows
    // refunding a payment whose status is COMPLETED or PARTIALLY_REFUNDED,
    // setting REFUNDED here would also permanently block the real refund flow
    // from ever fixing it.
    if (
      dto.status === PaymentStatus.PARTIALLY_REFUNDED ||
      dto.status === PaymentStatus.REFUNDED
    ) {
      throw new BadRequestException(
        `Status "${dto.status}" is set automatically by the refund flow and cannot be assigned directly`,
      );
    }

    // Locks the payment row so this read-check-write can't interleave with
    // a concurrent webhook event (completeFromGatewayEvent/
    // failFromGatewayEvent) touching the same payment, and folds the order
    // status sync into the same transaction so the two writes commit or
    // roll back together.
    return this.commitAndNotify<Payment>(async (manager) => {
      const payment = await this.lockPayment(manager, id);
      if (!payment) throw new NotFoundException('Payment not found');

      if (TERMINAL_PAYMENT_STATUSES.includes(payment.status)) {
        throw new BadRequestException(
          `Cannot update a payment with status "${payment.status}"`,
        );
      }

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
        orderNotify = await this.ordersService.applyStatusChange(
          payment.order_id,
          OrderStatus.CONFIRMED,
          {
            actorType: OrderStatusChangeActor.ADMIN,
            actorId,
            note: 'Payment completed',
          },
          manager,
        );
      }

      return { result: await manager.save(Payment, payment), orderNotify };
    });
  }

  async completeFromGatewayEvent(
    paymentId: string,
    transactionId: string,
    metadata: Record<string, unknown>,
    note: string,
  ): Promise<GatewayEventOutcome> {
    // Locked read-check-write: Stripe can redeliver or race webhook events,
    // so without a lock a delayed/duplicate event could interleave with
    // another one on the same payment (e.g. a stale "failed" event landing
    // after this "completed" one already committed) and both would read the
    // same pre-update status and pass the terminal-status check. Folding the
    // order sync into the same transaction also keeps payment and order
    // status from diverging if applyStatusChange throws.
    return this.commitAndNotify<GatewayEventOutcome>(async (manager) => {
      const payment = await this.lockPayment(manager, paymentId);
      if (!payment) return { result: 'not_found', orderNotify: null };
      if (TERMINAL_PAYMENT_STATUSES.includes(payment.status)) {
        return { result: 'already_terminal', orderNotify: null };
      }

      payment.status = PaymentStatus.COMPLETED;
      payment.transactionId = transactionId;
      payment.metadata = metadata;
      payment.paidAt = new Date();
      await manager.save(Payment, payment);

      const orderNotify = await this.ordersService.applyStatusChange(
        payment.order_id,
        OrderStatus.CONFIRMED,
        { actorType: OrderStatusChangeActor.SYSTEM, note },
        manager,
      );

      return { result: 'processed', orderNotify };
    });
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
      if (TERMINAL_PAYMENT_STATUSES.includes(payment.status)) {
        return 'already_terminal';
      }

      payment.status = PaymentStatus.FAILED;
      payment.metadata = metadata;
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
      if (payment.status === PaymentStatus.REFUNDED) {
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

    if (
      payment.status !== PaymentStatus.COMPLETED &&
      payment.status !== PaymentStatus.PARTIALLY_REFUNDED
    ) {
      throw new BadRequestException(
        `Cannot refund a payment with status "${payment.status}"`,
      );
    }

    const orderItemsById = new Map<string, OrderItem>(
      payment.order.items.map((item) => [item.id, item]),
    );

    const requestedItemIds = new Set<string>();
    for (const reqItem of items) {
      if (requestedItemIds.has(reqItem.order_item_id)) {
        throw new BadRequestException(
          `Order item ${reqItem.order_item_id} is listed more than once`,
        );
      }
      requestedItemIds.add(reqItem.order_item_id);
    }

    const committedQtyByItem = await this.getRefundQuantitiesByItem(
      manager,
      paymentId,
      COMMITTED_REFUND_STATUSES,
    );

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
      if (reqItem.quantity > refundableQty) {
        throw new BadRequestException(
          `Cannot refund ${reqItem.quantity} of "${orderItem.productName}" — only ${refundableQty} left refundable`,
        );
      }

      const itemAmount = new Big(Number(orderItem.unitPrice))
        .times(reqItem.quantity)
        .round(MONEY_DECIMAL_PLACES);
      amount = amount.plus(itemAmount);

      itemsToCreate.push({
        order_item_id: orderItem.id,
        quantity: reqItem.quantity,
        amount: itemAmount.toNumber(),
      });
    }

    const committedTotal = await this.sumRefundAmount(
      manager,
      paymentId,
      COMMITTED_REFUND_STATUSES,
    );
    if (new Big(committedTotal).plus(amount).gt(Number(payment.amount))) {
      throw new BadRequestException(
        'Refund amount exceeds the remaining refundable balance',
      );
    }

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
        const result = await provider.refund(payment, amount, dto.reason);
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
