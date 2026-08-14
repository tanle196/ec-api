import {
  BadRequestException,
  ForbiddenException,
  Injectable,
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

@Injectable()
export class PaymentsService {
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

    const result = await provider.initiate(payment, order);
    payment.transactionId = result.providerRef;
    payment.metadata = {
      ...(payment.metadata ?? {}),
      checkoutUrl: result.redirectUrl ?? null,
    };

    return this.paymentRepo.save(payment);
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
    // partially_refunded is a system-derived status: it's only ever set by
    // createRefund/refundFromGatewayEvent alongside an actual Refund record
    // and the matching order sync. Allowing an admin to set it directly here
    // would leave the payment claiming a partial refund that has no Refund
    // row behind it, and resolveRefundableItems would still see the full
    // amount as refundable.
    if (dto.status === PaymentStatus.PARTIALLY_REFUNDED) {
      throw new BadRequestException(
        'Status "partially_refunded" is set automatically by the refund flow and cannot be assigned directly',
      );
    }

    // Locks the payment row so this read-check-write can't interleave with
    // a concurrent webhook event (completeFromGatewayEvent/
    // failFromGatewayEvent) touching the same payment, and folds the order
    // status sync into the same transaction so the two writes commit or
    // roll back together.
    const { payment, orderNotify } = await this.dataSource.transaction(
      async (manager) => {
        const payment = await manager.findOne(Payment, {
          where: { id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!payment) throw new NotFoundException('Payment not found');

        if (
          payment.status === PaymentStatus.COMPLETED ||
          payment.status === PaymentStatus.PARTIALLY_REFUNDED ||
          payment.status === PaymentStatus.REFUNDED
        ) {
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

        if (dto.status === PaymentStatus.REFUNDED) {
          orderNotify = await this.ordersService.applyStatusChange(
            payment.order_id,
            OrderStatus.REFUNDED,
            {
              actorType: OrderStatusChangeActor.ADMIN,
              actorId,
              note: 'Payment refunded',
            },
            manager,
          );
        }

        return { payment: await manager.save(Payment, payment), orderNotify };
      },
    );

    // Only fires once the transaction above has actually committed — see
    // applyStatusChange's doc comment for why this can't happen inline.
    if (orderNotify) {
      this.ordersService.notifyOrderStatusChanged(
        orderNotify.order,
        orderNotify.fromStatus,
      );
    }

    return payment;
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
    const { outcome, orderNotify } = await this.dataSource.transaction(
      async (manager) => {
        const payment = await manager.findOne(Payment, {
          where: { id: paymentId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!payment)
          return { outcome: 'not_found' as const, orderNotify: null };
        if (
          payment.status === PaymentStatus.COMPLETED ||
          payment.status === PaymentStatus.PARTIALLY_REFUNDED ||
          payment.status === PaymentStatus.REFUNDED
        ) {
          return { outcome: 'already_terminal' as const, orderNotify: null };
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

        return { outcome: 'processed' as const, orderNotify };
      },
    );

    // Only fires once the transaction above has actually committed — see
    // applyStatusChange's doc comment for why this can't happen inline.
    if (orderNotify) {
      this.ordersService.notifyOrderStatusChanged(
        orderNotify.order,
        orderNotify.fromStatus,
      );
    }

    return outcome;
  }

  async failFromGatewayEvent(
    paymentId: string,
    metadata: Record<string, unknown>,
  ): Promise<GatewayEventOutcome> {
    // See completeFromGatewayEvent — same locked read-check-write to stay
    // safe against redelivered/racing webhook events on the same payment.
    return this.dataSource.transaction(async (manager) => {
      const payment = await manager.findOne(Payment, {
        where: { id: paymentId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!payment) return 'not_found';
      if (
        payment.status === PaymentStatus.COMPLETED ||
        payment.status === PaymentStatus.PARTIALLY_REFUNDED ||
        payment.status === PaymentStatus.REFUNDED
      ) {
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
    const { outcome, orderNotify } = await this.dataSource.transaction(
      async (manager) => {
        const payment = await manager.findOne(Payment, {
          where: { id: paymentId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!payment) {
          return { outcome: 'not_found' as const, orderNotify: null };
        }
        if (payment.status === PaymentStatus.REFUNDED) {
          return { outcome: 'already_terminal' as const, orderNotify: null };
        }

        const latestRefundId = this.extractLatestRefundId(charge);
        if (latestRefundId) {
          const alreadyRecorded = await manager.findOne(Refund, {
            where: { transactionId: latestRefundId },
          });
          if (alreadyRecorded) {
            return { outcome: 'already_terminal' as const, orderNotify: null };
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
          return { outcome: 'already_terminal' as const, orderNotify: null };
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

        return { outcome: 'processed' as const, orderNotify };
      },
    );

    // Only fires once the transaction above has actually committed — see
    // applyStatusChange's doc comment for why this can't happen inline.
    if (orderNotify) {
      this.ordersService.notifyOrderStatusChanged(
        orderNotify.order,
        orderNotify.fromStatus,
      );
    }

    return outcome;
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
        await manager.findOne(Payment, {
          where: { id: paymentId },
          lock: { mode: 'pessimistic_write' },
        });

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
    const orderNotify = await this.dataSource.transaction(async (manager) => {
      await manager.save(Refund, refund);

      if (gatewayError) return null;

      // Use the freshly locked row as the base for the mutation, not the
      // `payment` object captured back in Phase 1 — that snapshot predates
      // the (potentially slow) gateway call in Phase 2, so saving it back
      // as-is would silently revert any field a concurrent settlement wrote
      // to this payment in between.
      const lockedPayment = await manager.findOne(Payment, {
        where: { id: payment.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedPayment) throw new NotFoundException('Payment not found');

      const succeededTotal = await this.sumRefundAmount(manager, paymentId, [
        RefundStatus.SUCCEEDED,
      ]);
      lockedPayment.status =
        succeededTotal >= Number(lockedPayment.amount)
          ? PaymentStatus.REFUNDED
          : PaymentStatus.PARTIALLY_REFUNDED;
      await manager.save(Payment, lockedPayment);

      return this.ordersService.applyStatusChange(
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
    });

    // Only fires once the transaction above has actually committed — see
    // applyStatusChange's doc comment for why this can't happen inline.
    if (orderNotify) {
      this.ordersService.notifyOrderStatusChanged(
        orderNotify.order,
        orderNotify.fromStatus,
      );
    }

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
