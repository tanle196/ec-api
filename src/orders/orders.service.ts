import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  In,
  QueryFailedError,
  Repository,
} from 'typeorm';
import Big from 'big.js';
import { Address } from '@/addresses/entities/address.entity';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { Discount } from '@/discounts/entities/discount.entity';
import { DiscountsService } from '@/discounts/discounts.service';
import { CartsService } from '@/carts/carts.service';
import { CartItem } from '@/carts/entities/cart-item.entity';
import { InventoryService, StockLine } from '@/inventory/inventory.service';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { MONEY_DECIMAL_PLACES, toMoney } from '@/common/utils/money.util';
import { TypedConfigService } from '@/config/TypedConfigService';
import { OutboxService } from '@/outbox/outbox.service';
import { Payment } from '@/payments/entities/payment.entity';
import { PaymentStatus } from '@/payments/enums/payment-status.enum';
import { CreateOrderDto } from './dto/create-order.dto';
import { CheckoutDto } from './dto/checkout.dto';
import {
  OrderListQueryDto,
  OrderSortField,
  SortOrder,
} from './dto/order-list-query.dto';
import { UpdateOrderDto } from './dto/update-order.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatusHistory } from './entities/order-status-history.entity';
import { OrderStatus } from './enums/order-status.enum';
import { OrderStatusChangeActor } from './enums/order-status-change-actor.enum';
import { OrderEvents } from './order-events';
import { OrderPolicy } from './policies/order.policy';
import { snapshotAddress } from './types/shipping-address-snapshot';
import { allocateOrderLines, LineAllocation } from './pricing/order-pricing';

interface ResolvedOrderItem {
  variant_id: string;
  // Not persisted on the item; only used to match scoped discount codes.
  product_id: string;
  category_id: string;
  productName: string;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  total: number;
}

interface OrderPricing {
  // Codes in the order they were applied, with what each took off.
  applied: { discount: Discount; amount: number }[];
  discountTotal: number;
  // Aligned with the resolved items.
  lines: LineAllocation[];
}

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectRepository(Order)
    private readonly orderRepo: Repository<Order>,
    @InjectRepository(Address)
    private readonly addressRepo: Repository<Address>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    @InjectRepository(OrderStatusHistory)
    private readonly statusHistoryRepo: Repository<OrderStatusHistory>,
    @InjectRepository(Payment)
    private readonly paymentRepo: Repository<Payment>,
    private readonly dataSource: DataSource,
    private readonly discountsService: DiscountsService,
    private readonly configService: TypedConfigService,
    private readonly cartsService: CartsService,
    private readonly orderPolicy: OrderPolicy,
    private readonly inventoryService: InventoryService,
    private readonly outboxService: OutboxService,
  ) {}

  /**
   * `idempotencyKey` (the Idempotency-Key header) makes a retried request
   * return the order the first attempt created instead of placing another.
   */
  async create(
    userId: string,
    dto: CreateOrderDto,
    idempotencyKey?: string,
  ): Promise<Order> {
    const existing = await this.findByIdempotencyKey(userId, idempotencyKey);
    if (existing) return existing;

    // Address is validated first so a bad address_id always fails fast with
    // a consistent error, regardless of DB latency. Kept sequential (rather
    // than Promise.all with resolveOrderItems) so the observable error for a
    // request with both an invalid address and invalid items doesn't depend
    // on which query happens to settle first.
    const address = await this.addressRepo.findOne({
      where: { id: dto.address_id, user_id: userId },
    });
    if (!address) throw new NotFoundException('Address not found');

    const { subtotal, resolvedItems } = await this.resolveOrderItems(dto.items);

    const discount = await this.resolveDiscount(
      dto.discountCode,
      subtotal,
      userId,
    );
    const shippingFee = this.configService.getAppConfig().shippingFlatFee;
    const pricing = await this.priceOrder(
      resolvedItems,
      discount ? [discount] : [],
      shippingFee,
    );

    return this.placeOnce(userId, idempotencyKey, (manager) =>
      this.persistOrder(manager, {
        userId,
        address,
        resolvedItems,
        subtotal,
        shippingFee,
        pricing,
        notes: dto.notes,
        idempotencyKey,
      }),
    );
  }

  async checkout(
    userId: string,
    dto: CheckoutDto,
    idempotencyKey?: string,
  ): Promise<Order> {
    const existing = await this.findByIdempotencyKey(userId, idempotencyKey);
    if (existing) return existing;

    // Address is validated before fetching the cart. getCart() creates and
    // persists an empty cart as a side effect when the user has none, so
    // running it concurrently with the address check would leave stray cart
    // rows behind for requests that were always going to fail validation.
    const address = await this.addressRepo.findOne({
      where: { id: dto.address_id, user_id: userId },
    });
    if (!address) throw new NotFoundException('Address not found');

    const cart = await this.cartsService.getCart(userId);

    this.orderPolicy.assertCartNotEmpty(cart.items);

    const items = cart.items.map((item) => ({
      variant_id: item.variant_id,
      quantity: item.quantity,
    }));

    const { subtotal, resolvedItems } = await this.resolveOrderItems(items);
    const discount = await this.resolveDiscount(
      dto.discountCode,
      subtotal,
      userId,
    );
    const shippingFee = this.configService.getAppConfig().shippingFlatFee;
    const pricing = await this.priceOrder(
      resolvedItems,
      discount ? [discount] : [],
      shippingFee,
    );

    return this.placeOnce(userId, idempotencyKey, (manager) =>
      this.persistOrder(manager, {
        userId,
        address,
        resolvedItems,
        subtotal,
        shippingFee,
        pricing,
        notes: dto.notes,
        cartId: cart.id,
        idempotencyKey,
      }),
    );
  }

  private async findByIdempotencyKey(
    userId: string,
    key: string | undefined,
  ): Promise<Order | null> {
    if (!key) return null;
    const order = await this.orderRepo.findOne({
      where: { user_id: userId, idempotencyKey: key },
    });
    return order
      ? this.findOrderOrThrow(this.orderRepo.manager, order.id)
      : null;
  }

  // Runs the placement; if a concurrent request with the same key won the
  // race (unique index), returns that request's order instead of failing.
  private async placeOnce(
    userId: string,
    idempotencyKey: string | undefined,
    place: (manager: EntityManager) => Promise<Order>,
  ): Promise<Order> {
    try {
      return await this.dataSource.transaction(place);
    } catch (error) {
      if (idempotencyKey && this.isIdempotencyConflict(error)) {
        const existing = await this.findByIdempotencyKey(
          userId,
          idempotencyKey,
        );
        if (existing) return existing;
      }
      throw error;
    }
  }

  private async resolveOrderItems(
    items: { variant_id: string; quantity: number }[],
  ): Promise<{
    subtotal: number;
    resolvedItems: ResolvedOrderItem[];
    variantMap: Map<string, ProductVariant>;
  }> {
    const variantIds = items.map((i) => i.variant_id);
    const variants = await this.variantRepo.find({
      where: variantIds.map((id) => ({ id })),
      relations: ['product'],
    });

    const variantMap = new Map(variants.map((v) => [v.id, v]));

    // Money is accumulated with Big.js rather than native floats: e.g.
    // 19.99 * 3 in floating point drifts to 59.96999999999999, which would
    // eventually surface as an off-by-a-cent total. Big.js parses numbers as
    // exact decimal digits and does the arithmetic without binary rounding
    // error, only converting back to a plain number at the boundary.
    let subtotal = new Big(0);
    const resolvedItems: ResolvedOrderItem[] = [];

    for (const item of items) {
      const variant = variantMap.get(item.variant_id);
      if (!variant)
        throw new NotFoundException(`Variant ${item.variant_id} not found`);
      this.orderPolicy.assertVariantOrderable(variant);

      const unitPrice = Number(variant.price);
      const itemTotal = new Big(unitPrice)
        .times(item.quantity)
        .round(MONEY_DECIMAL_PLACES);
      subtotal = subtotal.plus(itemTotal);

      resolvedItems.push({
        variant_id: variant.id,
        product_id: variant.product.id,
        category_id: variant.product.category_id,
        productName: variant.product.name,
        variantName: variant.name,
        unitPrice,
        quantity: item.quantity,
        total: itemTotal.toNumber(),
      });
    }

    return {
      subtotal: toMoney(subtotal),
      resolvedItems,
      variantMap,
    };
  }

  private async resolveDiscount(
    discountCode: string | undefined,
    subtotal: number,
    userId: string,
  ): Promise<Discount | undefined> {
    if (!discountCode) return undefined;
    return this.discountsService.resolveCode(discountCode, subtotal, userId);
  }

  // Applies the codes one after another, each against what the previous
  // ones left on every line, then spreads discount and shipping per line.
  // Running codes on the remainder (rather than each on the full lines)
  // means stacked codes can never take a line below 0.
  private async priceOrder(
    resolvedItems: ResolvedOrderItem[],
    discounts: Discount[],
    shippingFee: number,
    manager?: EntityManager,
  ): Promise<OrderPricing> {
    const remaining = resolvedItems.map((item) => new Big(item.total));
    const lineDiscounts = resolvedItems.map(() => new Big(0));
    const applied: OrderPricing['applied'] = [];

    for (const discount of discounts) {
      const quote = await this.discountsService.quote(
        discount,
        resolvedItems.map((item, i) => ({
          productId: item.product_id,
          categoryId: item.category_id,
          amount: toMoney(remaining[i]),
        })),
        manager,
      );
      quote.lineAmounts.forEach((amount, i) => {
        remaining[i] = remaining[i].minus(amount);
        lineDiscounts[i] = lineDiscounts[i].plus(amount);
      });
      applied.push({ discount, amount: quote.amount });
    }

    const discountTotal = toMoney(
      lineDiscounts.reduce((sum, d) => sum.plus(d), new Big(0)),
    );

    return {
      applied,
      discountTotal,
      lines: allocateOrderLines(
        resolvedItems.map((item) => item.total),
        lineDiscounts.map((d) => toMoney(d)),
        shippingFee,
      ),
    };
  }

  private toOrderItems(
    manager: EntityManager,
    orderId: string,
    resolvedItems: ResolvedOrderItem[],
    lines: LineAllocation[],
  ): OrderItem[] {
    return resolvedItems.map((item, i) =>
      manager.create(OrderItem, {
        order_id: orderId,
        variant_id: item.variant_id,
        productName: item.productName,
        variantName: item.variantName,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        total: item.total,
        ...lines[i],
      }),
    );
  }

  private async persistOrder(
    manager: EntityManager,
    params: {
      userId: string;
      address: Address;
      resolvedItems: ResolvedOrderItem[];
      subtotal: number;
      shippingFee: number;
      pricing: OrderPricing;
      notes?: string;
      cartId?: string;
      idempotencyKey?: string;
    },
  ): Promise<Order> {
    const { shippingFee, pricing } = params;
    const total = toMoney(
      new Big(params.subtotal).plus(shippingFee).minus(pricing.discountTotal),
    );

    const savedOrder = await this.saveOrderWithUniqueNumber(manager, {
      user_id: params.userId,
      address_id: params.address.id,
      shippingAddress: snapshotAddress(params.address),
      idempotencyKey: params.idempotencyKey ?? null,
      status: OrderStatus.PENDING,
      subtotal: params.subtotal,
      shippingFee,
      discount: pricing.discountTotal,
      total,
      notes: params.notes ?? null,
    });

    await manager.save(
      OrderItem,
      this.toOrderItems(
        manager,
        savedOrder.id,
        params.resolvedItems,
        pricing.lines,
      ),
    );

    // Rolls the whole order back with a 422 if any line can't be held.
    await this.inventoryService.reserve(
      manager,
      this.stockLines(params.resolvedItems),
      { refType: 'order', refId: savedOrder.id, actorId: params.userId },
    );

    for (const { discount, amount } of pricing.applied) {
      await manager.query(
        `INSERT INTO "order_discount" ("order_id", "discount_id") VALUES ($1, $2)`,
        [savedOrder.id, discount.id],
      );
      await this.discountsService.redeem(manager, {
        discount,
        orderId: savedOrder.id,
        userId: params.userId,
        amount,
      });
    }

    if (params.cartId) {
      await manager.delete(CartItem, { cart_id: params.cartId });
    }

    await this.recordStatusChange(manager, {
      orderId: savedOrder.id,
      fromStatus: null,
      toStatus: OrderStatus.PENDING,
      actorType: OrderStatusChangeActor.CUSTOMER,
      actorId: params.userId,
    });
    await this.outboxService.enqueue(manager, {
      type: OrderEvents.PLACED,
      aggregateType: 'order',
      aggregateId: savedOrder.id,
      payload: { orderId: savedOrder.id },
    });

    return this.findOrderOrThrow(manager, savedOrder.id);
  }

  async findAll(
    query: OrderListQueryDto,
    requesterId?: string,
    isAdmin = false,
  ): Promise<PaginatedResponseDto<Order>> {
    const {
      page = 1,
      limit = 20,
      status,
      user_id,
      order_number,
      from_date,
      to_date,
      sort_by = OrderSortField.CREATED_AT,
      sort_order = SortOrder.DESC,
    } = query;

    const qb = this.orderRepo.createQueryBuilder('o');

    if (!isAdmin) {
      qb.andWhere('o.user_id = :userId', { userId: requesterId });
    } else if (user_id) {
      qb.andWhere('o.user_id = :userId', { userId: user_id });
    }

    if (status) qb.andWhere('o.status = :status', { status });

    if (order_number) {
      qb.andWhere('o.orderNumber ILIKE :orderNumber', {
        orderNumber: `%${order_number}%`,
      });
    }

    if (from_date) {
      qb.andWhere('o.createdAt >= :fromDate', { fromDate: from_date });
    }

    if (to_date) {
      // A date-only string (e.g. "2026-12-31") should include the entire
      // day, not just midnight, so push it to the end of day in that case.
      const toDate =
        to_date.length === 10 ? `${to_date}T23:59:59.999Z` : to_date;
      qb.andWhere('o.createdAt <= :toDate', { toDate });
    }

    const [data, total] = await qb
      .orderBy(`o.${sort_by}`, sort_order)
      .skip((page - 1) * limit)
      .take(limit)
      .getManyAndCount();

    return { data, total, page, limit };
  }

  // Centralizes the standard relations + not-found check so every read site
  // (including transactional ones) stays consistent. Callers inside a
  // `dataSource.transaction` MUST pass that transaction's manager here
  // instead of `this.orderRepo` — a separate connection can't see the
  // transaction's uncommitted writes and would throw NotFoundException.
  private async findOrderOrThrow(
    manager: EntityManager,
    id: string,
  ): Promise<Order> {
    const order = await manager.findOne(Order, {
      where: { id },
      relations: ['items', 'address', 'discounts'],
    });

    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  async findOne(id: string, userId?: string): Promise<Order> {
    const order = await this.findOrderOrThrow(this.orderRepo.manager, id);

    if (userId) this.orderPolicy.assertOwnedBy(order, userId);

    return order;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateOrderDto,
  ): Promise<Order> {
    const order = await this.findOne(id, userId);

    this.orderPolicy.assertEditable(order);

    let addressId = order.address_id;
    let shippingAddress = order.shippingAddress;
    if (dto.address_id && dto.address_id !== order.address_id) {
      const address = await this.addressRepo.findOne({
        where: { id: dto.address_id, user_id: userId },
      });
      if (!address) throw new NotFoundException('Address not found');
      addressId = dto.address_id;
      shippingAddress = snapshotAddress(address);
    }

    return this.dataSource.transaction(async (manager) => {
      // Re-checked under the row lock: a concurrent cancel/confirm could have
      // moved the order on since the read above, and releasing its stock
      // again here would double-count it.
      const locked = await manager.findOne(Order, {
        where: { id: order.id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!locked) throw new NotFoundException('Order not found');
      this.orderPolicy.assertEditable(locked);

      if (dto.items) {
        // Release the current hold before reserving the new set, so quantity
        // decreases free up stock and increases are checked against what is
        // actually available.
        await this.releaseStock(manager, order, {
          actorId: userId,
          note: 'Order edited',
        });

        const { subtotal, resolvedItems } = await this.resolveOrderItems(
          dto.items,
        );
        await this.inventoryService.reserve(
          manager,
          this.stockLines(resolvedItems),
          { refType: 'order', refId: order.id, actorId: userId },
        );
        // A payment started before the edit is for the old total; the
        // customer has to start a new one. If the old checkout still gets
        // paid, completion flags the amount mismatch.
        await this.voidPendingPayments(manager, order.id, 'order_edited');

        for (const discount of order.discounts) {
          this.orderPolicy.assertStillMeetsDiscountMinimum(discount, subtotal);
        }
        const pricing = await this.priceOrder(
          resolvedItems,
          order.discounts,
          Number(order.shippingFee),
          manager,
        );
        for (const { discount, amount } of pricing.applied) {
          await this.discountsService.updateRedemptionAmount(
            manager,
            order.id,
            discount.id,
            amount,
          );
        }

        await manager.delete(OrderItem, { order_id: order.id });
        await manager.save(
          OrderItem,
          this.toOrderItems(manager, order.id, resolvedItems, pricing.lines),
        );

        order.subtotal = subtotal;
        order.discount = pricing.discountTotal;
        order.total = toMoney(
          new Big(subtotal)
            .plus(Number(order.shippingFee))
            .minus(pricing.discountTotal),
        );
      }

      order.address_id = addressId;
      if (dto.notes !== undefined) order.notes = dto.notes;

      // `order.items` still holds the pre-edit relation snapshot, and Order's
      // OneToMany to OrderItem cascades; save() would try to re-persist those
      // stale rows (now deleted above) instead of the freshly created ones.
      // A targeted update() sidesteps the cascade entirely.
      await manager.update(Order, order.id, {
        address_id: order.address_id,
        shippingAddress,
        notes: order.notes,
        subtotal: order.subtotal,
        discount: order.discount,
        total: order.total,
      });

      return this.findOrderOrThrow(manager, order.id);
    });
  }

  async cancel(id: string, userId: string): Promise<Order> {
    // The precondition check and the write both happen inside the
    // transaction, against a row locked at the very start of it — not
    // against a snapshot fetched before the transaction opened. Without the
    // lock, this could race with a concurrent applyStatusChange (e.g. a
    // Stripe webhook confirming payment) or another cancel/updateStatus
    // call on the same order: both would validate against the same
    // pre-change status, and whichever `manager.save` commits last would
    // silently overwrite the other's status change — here that could mean
    // reverting a just-confirmed order back to CANCELLED and incorrectly
    // restoring stock for an order that was actually paid.
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Order not found');
      this.orderPolicy.assertOwnedBy(order, userId);
      this.orderPolicy.assertCancellable(order);

      // The cancellable statuses include CONFIRMED, which is also the status
      // a completed payment puts the order in — without this check, a
      // customer could self-cancel (and get stock silently restored for)
      // an order that was already actually paid, with no refund ever
      // triggered. The Order row lock taken above already serializes this
      // against a concurrent webhook still confirming payment — see the
      // comment at the top of this method.
      await this.assertNotPaid(manager, id);

      const fromStatus = order.status;

      await this.releaseStock(manager, order, {
        actorId: userId,
        note: 'Cancelled by customer',
      });
      await this.discountsService.releaseForOrder(manager, order.id);
      await this.voidPendingPayments(manager, order.id, 'order_cancelled');

      order.status = OrderStatus.CANCELLED;
      await manager.save(Order, order);

      await this.recordStatusChange(manager, {
        orderId: order.id,
        fromStatus,
        toStatus: OrderStatus.CANCELLED,
        actorType: OrderStatusChangeActor.CUSTOMER,
        actorId: userId,
      });

      return this.findOrderOrThrow(manager, order.id);
    });
  }

  /**
   * Ids of unpaid orders past the hold window. Only a pre-filter: each one
   * is re-checked under its row lock by `expireUnpaid`.
   */
  async findExpiredUnpaidOrderIds(
    cutoff: Date,
    limit = 100,
  ): Promise<string[]> {
    const rows = await this.orderRepo
      .createQueryBuilder('o')
      .select('o.id', 'id')
      .where('o.status = :status', { status: OrderStatus.PENDING })
      .andWhere('o.createdAt < :cutoff', { cutoff })
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM "payments" p
          WHERE p."order_id" = o."id"
            AND (p."method" IN (:...offline) OR p."status" IN (:...paid))
        )`,
        {
          offline: OrderPolicy.OFFLINE_PAYMENT_METHODS,
          paid: OrderPolicy.PAID_PAYMENT_STATUSES,
        },
      )
      .orderBy('o.createdAt', 'ASC')
      .limit(limit)
      .getRawMany<{ id: string }>();
    return rows.map((r) => r.id);
  }

  /**
   * Cancels one unpaid order whose hold expired, releasing its stock and
   * discount uses. Locks the order and re-checks every condition first, so
   * a payment confirmed (or a staff action) in the meantime wins and this
   * becomes a no-op. Safe to run from several instances at once. Returns
   * whether the order was expired.
   */
  async expireUnpaid(orderId: string, cutoff: Date): Promise<boolean> {
    const result = await this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) return false;

      const payments = await manager.find(Payment, {
        where: { order_id: orderId },
      });
      if (!this.orderPolicy.isExpired(order, payments, cutoff)) return false;

      const fromStatus = order.status;
      const note = 'Expired: not paid within the hold window';
      await this.releaseStock(manager, order, { note });
      await this.discountsService.releaseForOrder(manager, order.id);
      await this.voidPendingPayments(manager, order.id, 'order_expired');

      order.status = OrderStatus.CANCELLED;
      await manager.save(Order, order);
      await this.recordStatusChange(manager, {
        orderId: order.id,
        fromStatus,
        toStatus: OrderStatus.CANCELLED,
        actorType: OrderStatusChangeActor.SYSTEM,
        note,
      });

      return true;
    });

    return result;
  }

  async updateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    actor: { actorType: OrderStatusChangeActor; actorId?: string },
  ): Promise<Order> {
    // See cancel() — same lock-then-validate-then-write pattern, against the
    // same class of race with applyStatusChange/cancel/updateStatus calls
    // landing concurrently on the same order.
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Order not found');

      this.orderPolicy.assertCanTransition(order.status, dto.status);

      const fromStatus = order.status;

      if (dto.status === OrderStatus.CANCELLED) {
        // Same guard as the customer cancel(): cancelling a paid order
        // would restore stock while the customer's money is never
        // returned. Paid orders must go through the refund flow instead.
        await this.assertNotPaid(manager, order.id);
        await this.releaseStock(manager, order, {
          actorId: actor.actorId,
          note: dto.note ?? 'Cancelled by staff',
        });
        await this.discountsService.releaseForOrder(manager, order.id);
        await this.voidPendingPayments(manager, order.id, 'order_cancelled');
      }

      order.status = dto.status;
      await manager.save(Order, order);

      await this.recordStatusChange(manager, {
        orderId: order.id,
        fromStatus,
        toStatus: dto.status,
        actorType: actor.actorType,
        actorId: actor.actorId,
        note: dto.note,
      });

      return this.findOrderOrThrow(manager, order.id);
    });
  }

  /**
   * Moves an order on after its payment was captured, inside the payment's
   * transaction (`manager`):
   * - PENDING   -> CONFIRMED ('confirmed')
   * - CANCELLED -> CONFIRMED when the stock can be held again, with its
   *   discount uses reinstated ('revived'): the customer paid after the
   *   order expired or was cancelled, and we still have the goods.
   * - CANCELLED and the stock is gone -> unchanged ('not_revivable'); the
   *   caller refunds.
   * - anything else -> unchanged ('unchanged').
   *
   */
  async confirmAfterPayment(
    orderId: string,
    actor: {
      actorType: OrderStatusChangeActor;
      actorId?: string;
      note?: string;
    },
    manager: EntityManager,
  ): Promise<{
    outcome: 'confirmed' | 'revived' | 'not_revivable' | 'unchanged';
    order: Order;
    fromStatus: OrderStatus | null;
  }> {
    const order = await manager.findOne(Order, {
      where: { id: orderId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!order) throw new NotFoundException('Order not found');

    if (order.status === OrderStatus.PENDING) {
      const changed = await this.applyStatusChange(
        orderId,
        OrderStatus.CONFIRMED,
        actor,
        manager,
      );
      return { outcome: 'confirmed', ...changed };
    }

    if (order.status !== OrderStatus.CANCELLED) {
      return { outcome: 'unchanged', order, fromStatus: null };
    }

    const items = await manager.find(OrderItem, {
      where: { order_id: orderId },
    });
    try {
      // Savepoint: if any line can't be held, the lines already reserved
      // roll back with it and the payment transaction carries on.
      await manager.transaction((savepoint) =>
        this.inventoryService.reserve(savepoint, this.stockLines(items), {
          refType: 'order',
          refId: orderId,
          note: 'Revived: paid after cancellation',
        }),
      );
    } catch (error) {
      if (error instanceof UnprocessableEntityException) {
        return { outcome: 'not_revivable', order, fromStatus: null };
      }
      throw error;
    }

    // The customer paid the discounted price, so the codes are honoured
    // even if they have since run out.
    await this.discountsService.reinstateForOrder(manager, orderId);

    const fromStatus = order.status;
    order.status = OrderStatus.CONFIRMED;
    await manager.save(Order, order);
    await this.recordStatusChange(manager, {
      orderId,
      fromStatus,
      toStatus: OrderStatus.CONFIRMED,
      actorType: actor.actorType,
      actorId: actor.actorId,
      note: `Revived: paid after cancellation. ${actor.note ?? ''}`.trim(),
    });

    return { outcome: 'revived', order, fromStatus };
  }

  /**
   * For other modules (e.g. payments) that need to move an order's status
   * as a side effect of their own action, while still recording it in the
   * order's audit trail.
   */
  // `manager` lets a caller that's already inside its own transaction (e.g.
  // PaymentsService writing a payment row and the resulting order status
  // together) fold this status change into that same transaction instead of
  // opening a second independent one — otherwise the payment write could
  // commit while this order write fails (or vice versa). Notifications go
  // through the outbox in that same transaction, so they only ever go out
  // for changes that committed.
  async applyStatusChange(
    orderId: string,
    toStatus: OrderStatus,
    actor: {
      actorType: OrderStatusChangeActor;
      actorId?: string;
      note?: string;
    },
    manager?: EntityManager,
  ): Promise<{ order: Order; fromStatus: OrderStatus | null }> {
    const run = async (manager: EntityManager) => {
      // Locked for the same reason cancel()/updateStatus() lock the order
      // row: this read-check-write must not race with either of those, or
      // with another applyStatusChange call (e.g. two payment webhook
      // events touching the same order), or a later write here could
      // silently clobber a status change that landed in between.
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order) throw new NotFoundException('Order not found');
      if (order.status === toStatus) return { order, fromStatus: null };

      // No-op rather than an error so the caller (e.g.
      // PaymentsService.completeFromGatewayEvent) still persists the payment
      // itself; only the stale order-status bump is skipped.
      if (
        !this.orderPolicy.canApplyExternalStatusChange(order.status, toStatus)
      )
        return { order, fromStatus: null };

      const fromStatus = order.status;
      order.status = toStatus;
      await manager.save(Order, order);

      await this.recordStatusChange(manager, {
        orderId,
        fromStatus,
        toStatus,
        actorType: actor.actorType,
        actorId: actor.actorId,
        note: actor.note,
      });

      return { order, fromStatus };
    };

    return manager ? run(manager) : this.dataSource.transaction(run);
  }

  /**
   * Moves an order along with its shipment, inside the shipment's
   * transaction, applying the stock side of each step:
   * - processing -> shipped: the reservation leaves the warehouse
   *   (a re-attempt after delivery_failed ships nothing new)
   * - -> delivered: starts the return window
   * - -> returned_to_sender: the goods are back on sale; the outbox event
   *   lets payments return the money
   */
  async applyShipmentProgress(
    manager: EntityManager,
    orderId: string,
    toStatus: OrderStatus,
    actor: {
      actorType: OrderStatusChangeActor;
      actorId?: string;
      note?: string;
    },
  ): Promise<Order> {
    const order = await manager.findOne(Order, {
      where: { id: orderId },
      lock: { mode: 'pessimistic_write' },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.status === toStatus) return order;

    this.orderPolicy.assertShipmentTransition(order.status, toStatus);
    const fromStatus = order.status;

    if (
      fromStatus === OrderStatus.PROCESSING &&
      toStatus === OrderStatus.SHIPPED
    ) {
      await this.shipStock(manager, order, actor.actorId);
    }
    if (toStatus === OrderStatus.DELIVERED) {
      order.deliveredAt = new Date();
    }
    if (toStatus === OrderStatus.RETURNED_TO_SENDER) {
      const items = await this.loadItems(manager, order);
      await this.inventoryService.restock(manager, this.stockLines(items), {
        refType: 'order',
        refId: order.id,
        actorId: actor.actorId ?? null,
        note: 'Returned to sender',
      });
    }

    order.status = toStatus;
    await manager.save(Order, order);
    await this.recordStatusChange(manager, {
      orderId,
      fromStatus,
      toStatus,
      actorType: actor.actorType,
      actorId: actor.actorId,
      note: actor.note,
    });
    return order;
  }

  /**
   * Ids of delivered orders whose return window has ended and that have no
   * refund request still waiting. Pre-filter for `completeDelivered`.
   */
  async findCompletableOrderIds(cutoff: Date, limit = 200): Promise<string[]> {
    const rows = await this.orderRepo
      .createQueryBuilder('o')
      .select('o.id', 'id')
      .where('o.status = :delivered', { delivered: OrderStatus.DELIVERED })
      .andWhere('o.deliveredAt < :cutoff', { cutoff })
      .andWhere(
        `NOT EXISTS (
          SELECT 1 FROM "refund_requests" r
          WHERE r."order_id" = o."id" AND r."status" = 'pending'
        )`,
      )
      .orderBy('o.deliveredAt', 'ASC')
      .limit(limit)
      .getRawMany<{ id: string }>();
    return rows.map((r) => r.id);
  }

  /** Closes one order whose return window passed. Re-checked under lock. */
  async completeDelivered(orderId: string, cutoff: Date): Promise<boolean> {
    return this.dataSource.transaction(async (manager) => {
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !order ||
        !this.orderPolicy.isCompletable(order, cutoff) ||
        (await this.hasPendingRefundRequest(manager, orderId))
      ) {
        return false;
      }

      order.status = OrderStatus.COMPLETED;
      order.completedAt = new Date();
      await manager.save(Order, order);
      await this.recordStatusChange(manager, {
        orderId,
        fromStatus: OrderStatus.DELIVERED,
        toStatus: OrderStatus.COMPLETED,
        actorType: OrderStatusChangeActor.SYSTEM,
        note: 'Return window ended',
      });
      return true;
    });
  }

  private async hasPendingRefundRequest(
    manager: EntityManager,
    orderId: string,
  ): Promise<boolean> {
    const rows: unknown[] = await manager.query(
      `SELECT 1 FROM "refund_requests" WHERE "order_id" = $1 AND "status" = 'pending' LIMIT 1`,
      [orderId],
    );
    return rows.length > 0;
  }

  async getStatusHistory(
    id: string,
    userId?: string,
  ): Promise<OrderStatusHistory[]> {
    const order = await this.findOne(id, userId);

    return this.statusHistoryRepo.find({
      where: { order_id: order.id },
      order: { createdAt: 'ASC' },
    });
  }

  private async recordStatusChange(
    manager: EntityManager,
    params: {
      orderId: string;
      fromStatus: OrderStatus | null;
      toStatus: OrderStatus;
      actorType: OrderStatusChangeActor;
      actorId?: string;
      note?: string;
    },
  ): Promise<void> {
    await manager.save(
      OrderStatusHistory,
      manager.create(OrderStatusHistory, {
        order_id: params.orderId,
        fromStatus: params.fromStatus,
        toStatus: params.toStatus,
        changedByType: params.actorType,
        changedById: params.actorId ?? null,
        note: params.note ?? null,
      }),
    );

    // Every status change funnels through here, so this is the one place
    // its side effects are published (in the same transaction).
    if (params.fromStatus !== null) {
      await this.outboxService.enqueue(manager, {
        type: OrderEvents.STATUS_CHANGED,
        aggregateType: 'order',
        aggregateId: params.orderId,
        payload: {
          orderId: params.orderId,
          fromStatus: params.fromStatus,
          toStatus: params.toStatus,
        },
      });
    }
    if (params.toStatus === OrderStatus.RETURNED_TO_SENDER) {
      await this.outboxService.enqueue(manager, {
        type: OrderEvents.RETURNED_TO_SENDER,
        aggregateType: 'order',
        aggregateId: params.orderId,
        payload: { orderId: params.orderId },
      });
    }
  }

  private async assertNotPaid(
    manager: EntityManager,
    orderId: string,
  ): Promise<void> {
    const paidPayment = await manager.findOne(Payment, {
      where: {
        order_id: orderId,
        status: In([PaymentStatus.COMPLETED, PaymentStatus.PARTIALLY_REFUNDED]),
      },
    });
    if (paidPayment) {
      throw new BadRequestException(
        'Cannot cancel an order that has already been paid — request a refund instead',
      );
    }
  }

  // A cancelled order will never be paid through its open payments: mark
  // them FAILED so they stop counting as active. If the gateway still
  // captures one, completeFromGatewayEvent takes it (FAILED isn't terminal)
  // and confirmAfterPayment decides whether to revive or refund.
  private async voidPendingPayments(
    manager: EntityManager,
    orderId: string,
    reason: 'order_cancelled' | 'order_expired' | 'order_edited',
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .update(Payment)
      .set({
        status: PaymentStatus.FAILED,
        metadata: () =>
          `COALESCE("metadata", '{}'::jsonb) || jsonb_build_object('failureReason', CAST(:reason AS text))`,
      })
      .where('order_id = :orderId AND status = :pending', {
        orderId,
        pending: PaymentStatus.PENDING,
        reason,
      })
      .execute();
  }

  private stockLines(
    items: { variant_id: string | null; quantity: number }[],
  ): StockLine[] {
    return items
      .filter((item): item is { variant_id: string; quantity: number } =>
        Boolean(item.variant_id),
      )
      .map((item) => ({ variantId: item.variant_id, quantity: item.quantity }));
  }

  private async loadItems(
    manager: EntityManager,
    order: Order,
  ): Promise<OrderItem[]> {
    return order.items?.length
      ? order.items
      : manager.find(OrderItem, { where: { order_id: order.id } });
  }

  // Gives the order's held stock back (cancel, or before re-reserving on
  // edit). Lines whose variant was deleted are skipped.
  private async releaseStock(
    manager: EntityManager,
    order: Order,
    ref: { actorId?: string | null; note?: string },
  ): Promise<void> {
    const items = await this.loadItems(manager, order);
    await this.inventoryService.release(manager, this.stockLines(items), {
      refType: 'order',
      refId: order.id,
      actorId: ref.actorId ?? null,
      note: ref.note ?? null,
    });
  }

  // The order left the warehouse: consume its reservation and snapshot each
  // line's unit cost for margin reporting.
  private async shipStock(
    manager: EntityManager,
    order: Order,
    actorId?: string,
  ): Promise<void> {
    const items = await this.loadItems(manager, order);
    const costs = await this.inventoryService.ship(
      manager,
      this.stockLines(items),
      { refType: 'order', refId: order.id, actorId: actorId ?? null },
    );

    for (const item of items) {
      if (!item.variant_id) continue;
      await manager.update(OrderItem, item.id, {
        unitCost: costs.get(item.variant_id) ?? null,
      });
    }
  }

  private generateOrderNumber(): string {
    const date = new Date();
    const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ORD-${datePart}-${random}`;
  }

  // orderNumber's random suffix makes a collision very unlikely but not
  // impossible; without a retry it would surface as a raw unique-constraint
  // DB error instead of either succeeding or failing cleanly. Regenerate and
  // retry a bounded number of times before giving up.
  private async saveOrderWithUniqueNumber(
    manager: EntityManager,
    fields: {
      user_id: string;
      address_id: string;
      shippingAddress: Order['shippingAddress'];
      idempotencyKey: string | null;
      status: OrderStatus;
      subtotal: number;
      shippingFee: number;
      discount: number;
      total: number;
      notes: string | null;
    },
  ): Promise<Order> {
    const maxAttempts = 5;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const order = manager.create(Order, {
        ...fields,
        orderNumber: this.generateOrderNumber(),
      });

      try {
        // Wrapped in a nested transaction so a unique-constraint failure only
        // rolls back to a SAVEPOINT instead of aborting the whole outer
        // transaction (Postgres marks the entire transaction as aborted
        // after any failed statement, which would otherwise make every
        // subsequent retry attempt fail with "current transaction is
        // aborted" instead of actually retrying).
        return await manager.transaction((txManager) =>
          txManager.save(Order, order),
        );
      } catch (error) {
        if (!this.isOrderNumberCollision(error) || attempt === maxAttempts) {
          throw error;
        }
        this.logger.warn(
          `Order number collision on attempt ${attempt}, retrying`,
        );
      }
    }

    // Unreachable: the loop above always returns or throws.
    throw new Error('Failed to generate a unique order number');
  }

  private isIdempotencyConflict(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error as QueryFailedError & { constraint?: string };
    return driverError.constraint === 'UQ_orders_user_idempotency_key';
  }

  private isOrderNumberCollision(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error as QueryFailedError & {
      code?: string;
      detail?: string;
    };
    return (
      driverError.code === '23505' &&
      typeof driverError.detail === 'string' &&
      driverError.detail.includes('orderNumber')
    );
  }
}
