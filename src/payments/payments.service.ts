import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Order } from '@/orders/entities/order.entity';
import { OrderStatus } from '@/orders/enums/order-status.enum';
import { OrderStatusChangeActor } from '@/orders/enums/order-status-change-actor.enum';
import { OrdersService } from '@/orders/orders.service';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
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

type GatewayEventOutcome = 'processed' | 'already_terminal' | 'not_found';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Refund)
    private readonly refundRepo: Repository<Refund>,
    private readonly ordersService: OrdersService,
    private readonly gatewayRegistry: PaymentGatewayRegistry,
  ) {}

  async create(userId: string, dto: CreatePaymentDto): Promise<Payment> {
    const order = await this.orderRepo.findOne({ where: { id: dto.order_id } });
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

    const existingActive = await this.paymentRepo.findOne({
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

    const payment = await this.paymentRepo.save(
      this.paymentRepo.create({
        order_id: dto.order_id,
        method: dto.method,
        status: PaymentStatus.PENDING,
        amount: order.total,
      }),
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
    const payment = await this.findOne(id);

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

    if (dto.status === PaymentStatus.COMPLETED) {
      payment.paidAt = new Date();
      await this.ordersService.applyStatusChange(
        payment.order_id,
        OrderStatus.CONFIRMED,
        {
          actorType: OrderStatusChangeActor.ADMIN,
          actorId,
          note: 'Payment completed',
        },
      );
    }

    if (dto.status === PaymentStatus.REFUNDED) {
      await this.ordersService.applyStatusChange(
        payment.order_id,
        OrderStatus.REFUNDED,
        {
          actorType: OrderStatusChangeActor.ADMIN,
          actorId,
          note: 'Payment refunded',
        },
      );
    }

    return this.paymentRepo.save(payment);
  }

  async completeFromGatewayEvent(
    paymentId: string,
    transactionId: string,
    metadata: Record<string, unknown>,
    note: string,
  ): Promise<GatewayEventOutcome> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
    });
    if (!payment) return 'not_found';
    if (
      payment.status === PaymentStatus.COMPLETED ||
      payment.status === PaymentStatus.PARTIALLY_REFUNDED ||
      payment.status === PaymentStatus.REFUNDED
    ) {
      return 'already_terminal';
    }

    payment.status = PaymentStatus.COMPLETED;
    payment.transactionId = transactionId;
    payment.metadata = metadata;
    payment.paidAt = new Date();
    await this.paymentRepo.save(payment);

    await this.ordersService.applyStatusChange(
      payment.order_id,
      OrderStatus.CONFIRMED,
      { actorType: OrderStatusChangeActor.SYSTEM, note },
    );

    return 'processed';
  }

  async failFromGatewayEvent(
    paymentId: string,
    metadata: Record<string, unknown>,
  ): Promise<GatewayEventOutcome> {
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
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
    await this.paymentRepo.save(payment);

    return 'processed';
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
    const payment = await this.paymentRepo.findOne({
      where: { id: paymentId },
    });
    if (!payment) return 'not_found';
    if (payment.status === PaymentStatus.REFUNDED) {
      return 'already_terminal';
    }

    const latestRefundId = this.extractLatestRefundId(charge);
    if (latestRefundId) {
      const alreadyRecorded = await this.refundRepo.findOne({
        where: { transactionId: latestRefundId },
      });
      if (alreadyRecorded) return 'already_terminal';
    }

    const amountTotal = Number(charge.amount ?? payment.amount);
    const amountRefundedTotal = Number(charge.amount_refunded ?? 0);
    const alreadyRefunded = await this.sumSucceededRefundAmount(paymentId);
    const newAmount = amountRefundedTotal - alreadyRefunded;
    if (newAmount <= 0) return 'already_terminal';

    await this.refundRepo.save(
      this.refundRepo.create({
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
    await this.paymentRepo.save(payment);

    await this.ordersService.applyStatusChange(
      payment.order_id,
      payment.status === PaymentStatus.REFUNDED
        ? OrderStatus.REFUNDED
        : OrderStatus.PARTIALLY_REFUNDED,
      { actorType: OrderStatusChangeActor.SYSTEM, note },
    );

    return 'processed';
  }

  /**
   * Validates that the requested items are refundable (not exceeding the
   * order item's remaining quantity or the payment's remaining balance) and
   * computes the resulting refund amount. `extraReservedQtyByItem` lets
   * callers (e.g. refund requests awaiting approval) fold in quantities that
   * aren't refunded yet but shouldn't be double-committed either.
   */
  async resolveRefundableItems(
    paymentId: string,
    items: { order_item_id: string; quantity: number }[],
    extraReservedQtyByItem?: Map<string, number>,
  ): Promise<{
    payment: Payment;
    itemsToCreate: Partial<RefundItem>[];
    amount: number;
  }> {
    const payment = await this.paymentRepo.findOne({
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

    const refundedQtyByItem = await this.getRefundedQuantitiesByItem(paymentId);

    let amount = 0;
    const itemsToCreate: Partial<RefundItem>[] = [];

    for (const reqItem of items) {
      const orderItem = orderItemsById.get(reqItem.order_item_id);
      if (!orderItem) {
        throw new BadRequestException(
          `Order item ${reqItem.order_item_id} does not belong to this order`,
        );
      }

      const alreadyRefundedQty = refundedQtyByItem.get(orderItem.id) ?? 0;
      const reservedQty = extraReservedQtyByItem?.get(orderItem.id) ?? 0;
      const refundableQty =
        orderItem.quantity - alreadyRefundedQty - reservedQty;
      if (reqItem.quantity > refundableQty) {
        throw new BadRequestException(
          `Cannot refund ${reqItem.quantity} of "${orderItem.productName}" — only ${refundableQty} left refundable`,
        );
      }

      const itemAmount = Number(orderItem.unitPrice) * reqItem.quantity;
      amount += itemAmount;

      itemsToCreate.push({
        order_item_id: orderItem.id,
        quantity: reqItem.quantity,
        amount: itemAmount,
      });
    }

    const alreadyRefundedTotal = await this.sumSucceededRefundAmount(paymentId);
    if (alreadyRefundedTotal + amount > Number(payment.amount)) {
      throw new BadRequestException(
        'Refund amount exceeds the remaining refundable balance',
      );
    }

    return { payment, itemsToCreate, amount };
  }

  async createRefund(
    paymentId: string,
    dto: CreateRefundDto,
    actorId?: string,
  ): Promise<Refund> {
    const { payment, itemsToCreate, amount } =
      await this.resolveRefundableItems(paymentId, dto.items);

    const alreadyRefundedTotal = await this.sumSucceededRefundAmount(paymentId);

    const refund = await this.refundRepo.save(
      this.refundRepo.create({
        payment_id: payment.id,
        order_id: payment.order_id,
        amount,
        reason: dto.reason,
        status: RefundStatus.PENDING,
        actorId: actorId ?? null,
        items: itemsToCreate as RefundItem[],
      }),
    );

    const provider = this.gatewayRegistry.resolve(payment.method);

    try {
      if (provider?.refund) {
        const result = await provider.refund(payment, amount, dto.reason);
        refund.transactionId = result.providerRef;
        refund.metadata = result.raw ?? null;
      }
      refund.status = RefundStatus.SUCCEEDED;
      await this.refundRepo.save(refund);
    } catch (error) {
      refund.status = RefundStatus.FAILED;
      refund.metadata = {
        error: error instanceof Error ? error.message : String(error),
      };
      await this.refundRepo.save(refund);
      throw error;
    }

    const totalRefunded = alreadyRefundedTotal + amount;
    payment.status =
      totalRefunded >= Number(payment.amount)
        ? PaymentStatus.REFUNDED
        : PaymentStatus.PARTIALLY_REFUNDED;
    await this.paymentRepo.save(payment);

    await this.ordersService.applyStatusChange(
      payment.order_id,
      payment.status === PaymentStatus.REFUNDED
        ? OrderStatus.REFUNDED
        : OrderStatus.PARTIALLY_REFUNDED,
      {
        actorType: OrderStatusChangeActor.ADMIN,
        actorId,
        note: `Refund: ${dto.reason}`,
      },
    );

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

  private async getRefundedQuantitiesByItem(
    paymentId: string,
  ): Promise<Map<string, number>> {
    const refunds = await this.refundRepo.find({
      where: { payment_id: paymentId, status: RefundStatus.SUCCEEDED },
    });

    const refundedQtyByItem = new Map<string, number>();
    for (const refund of refunds) {
      for (const item of refund.items) {
        refundedQtyByItem.set(
          item.order_item_id,
          (refundedQtyByItem.get(item.order_item_id) ?? 0) + item.quantity,
        );
      }
    }
    return refundedQtyByItem;
  }

  private async sumSucceededRefundAmount(paymentId: string): Promise<number> {
    const result = await this.refundRepo
      .createQueryBuilder('r')
      .select('COALESCE(SUM(r.amount), 0)', 'total')
      .where('r.payment_id = :paymentId', { paymentId })
      .andWhere('r.status = :status', { status: RefundStatus.SUCCEEDED })
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
