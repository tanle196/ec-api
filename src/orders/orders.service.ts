import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  QueryFailedError,
  Repository,
} from 'typeorm';
import Big from 'big.js';
import { Address } from '@/addresses/entities/address.entity';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { DiscountsService } from '@/discounts/discounts.service';
import { CartsService } from '@/carts/carts.service';
import { CartItem } from '@/carts/entities/cart-item.entity';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { MONEY_DECIMAL_PLACES, toMoney } from '@/common/utils/money.util';
import { TypedConfigService } from '@/config/TypedConfigService';
import { MailService } from '@/mail/mail.service';
import { UsersService } from '@/users/users.service';
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

interface ResolvedOrderItem {
  variant_id: string;
  productName: string;
  variantName: string | null;
  unitPrice: number;
  quantity: number;
  total: number;
}

const CANCELLABLE_STATUSES: OrderStatus[] = [
  OrderStatus.PENDING,
  OrderStatus.CONFIRMED,
];

// Valid forward-moving transitions for admin status updates; anything not
// listed here (e.g. moving backwards, or out of a terminal status) is rejected.
const ALLOWED_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
  [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
  [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
  [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
  [OrderStatus.DELIVERED]: [OrderStatus.REFUNDED],
  [OrderStatus.CANCELLED]: [],
  [OrderStatus.PARTIALLY_REFUNDED]: [OrderStatus.REFUNDED],
  [OrderStatus.REFUNDED]: [],
};

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
    private readonly dataSource: DataSource,
    private readonly discountsService: DiscountsService,
    private readonly configService: TypedConfigService,
    private readonly cartsService: CartsService,
    private readonly mailService: MailService,
    private readonly usersService: UsersService,
  ) {}

  async create(userId: string, dto: CreateOrderDto): Promise<Order> {
    // Address is validated first so a bad address_id always fails fast with
    // a consistent error, regardless of DB latency. Kept sequential (rather
    // than Promise.all with resolveOrderItems) so the observable error for a
    // request with both an invalid address and invalid items doesn't depend
    // on which query happens to settle first.
    const address = await this.addressRepo.findOne({
      where: { id: dto.address_id, user_id: userId },
    });
    if (!address) throw new NotFoundException('Address not found');

    const { subtotal, resolvedItems, variantMap } =
      await this.resolveOrderItems(dto.items);

    const { discountAmount, discountId } = await this.resolveDiscount(
      dto.discountCode,
      subtotal,
    );

    const order = await this.dataSource.transaction((manager) =>
      this.persistOrder(manager, {
        userId,
        addressId: dto.address_id,
        resolvedItems,
        variantMap,
        subtotal,
        discountAmount,
        discountId,
        notes: dto.notes,
      }),
    );

    void this.notifyOrderConfirmation(order);

    return order;
  }

  async checkout(userId: string, dto: CheckoutDto): Promise<Order> {
    // Address is validated before fetching the cart. getCart() creates and
    // persists an empty cart as a side effect when the user has none, so
    // running it concurrently with the address check would leave stray cart
    // rows behind for requests that were always going to fail validation.
    const address = await this.addressRepo.findOne({
      where: { id: dto.address_id, user_id: userId },
    });
    if (!address) throw new NotFoundException('Address not found');

    const cart = await this.cartsService.getCart(userId);

    if (!cart.items.length) {
      throw new BadRequestException('Cart is empty');
    }

    const items = cart.items.map((item) => ({
      variant_id: item.variant_id,
      quantity: item.quantity,
    }));

    const { subtotal, resolvedItems, variantMap } =
      await this.resolveOrderItems(items);
    const { discountAmount, discountId } = await this.resolveDiscount(
      dto.discountCode,
      subtotal,
    );

    const order = await this.dataSource.transaction((manager) =>
      this.persistOrder(manager, {
        userId,
        addressId: dto.address_id,
        resolvedItems,
        variantMap,
        subtotal,
        discountAmount,
        discountId,
        notes: dto.notes,
        cartId: cart.id,
      }),
    );

    void this.notifyOrderConfirmation(order);

    return order;
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
      if (!variant.isActive)
        throw new UnprocessableEntityException(
          `Variant ${variant.sku} is inactive`,
        );

      const unitPrice = Number(variant.price);
      const itemTotal = new Big(unitPrice)
        .times(item.quantity)
        .round(MONEY_DECIMAL_PLACES);
      subtotal = subtotal.plus(itemTotal);

      resolvedItems.push({
        variant_id: variant.id,
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
  ): Promise<{ discountAmount: number; discountId?: string }> {
    if (!discountCode) return { discountAmount: 0 };

    const discountEntity = await this.discountsService.resolveCode(
      discountCode,
      subtotal,
    );
    const discountAmount = this.discountsService.computeAmount(
      discountEntity,
      subtotal,
    );

    return { discountAmount, discountId: discountEntity.id };
  }

  private async persistOrder(
    manager: EntityManager,
    params: {
      userId: string;
      addressId: string;
      resolvedItems: ResolvedOrderItem[];
      variantMap: Map<string, ProductVariant>;
      subtotal: number;
      discountAmount: number;
      discountId?: string;
      notes?: string;
      cartId?: string;
    },
  ): Promise<Order> {
    // Sort by variant_id before locking so concurrent orders that share
    // variants always acquire row locks in the same order, avoiding a
    // classic lock-order deadlock (order A locks X then waits on Y while
    // order B locks Y then waits on X).
    const itemsToLock = [...params.resolvedItems].sort((a, b) =>
      a.variant_id.localeCompare(b.variant_id),
    );
    for (const item of itemsToLock) {
      await this.decrementStock(manager, item, params.variantMap);
    }

    const shippingFee = this.configService.getAppConfig().shippingFlatFee;
    const total = toMoney(
      new Big(params.subtotal).plus(shippingFee).minus(params.discountAmount),
    );

    const savedOrder = await this.saveOrderWithUniqueNumber(manager, {
      user_id: params.userId,
      address_id: params.addressId,
      status: OrderStatus.PENDING,
      subtotal: params.subtotal,
      shippingFee,
      discount: params.discountAmount,
      total,
      notes: params.notes ?? null,
    });

    await manager.save(
      OrderItem,
      params.resolvedItems.map((item) =>
        manager.create(OrderItem, { ...item, order_id: savedOrder.id }),
      ),
    );

    if (params.discountId) {
      await manager.query(
        `INSERT INTO "order_discount" ("order_id", "discount_id") VALUES ($1, $2)`,
        [savedOrder.id, params.discountId],
      );
      await this.discountsService.incrementUsedCount(
        manager,
        params.discountId,
      );
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

    if (userId && order.user_id !== userId) throw new ForbiddenException();

    return order;
  }

  async update(
    id: string,
    userId: string,
    dto: UpdateOrderDto,
  ): Promise<Order> {
    const order = await this.findOne(id, userId);

    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException(
        `Cannot edit an order with status "${order.status}"`,
      );
    }

    let addressId = order.address_id;
    if (dto.address_id && dto.address_id !== order.address_id) {
      const address = await this.addressRepo.findOne({
        where: { id: dto.address_id, user_id: userId },
      });
      if (!address) throw new NotFoundException('Address not found');
      addressId = dto.address_id;
    }

    return this.dataSource.transaction(async (manager) => {
      if (dto.items) {
        // Release stock held by the current items before re-resolving and
        // decrementing for the new set, so quantity decreases free up stock
        // and increases are checked against availability atomically.
        await this.restoreStock(order, manager);

        const { subtotal, resolvedItems, variantMap } =
          await this.resolveOrderItems(dto.items);

        // Sort by variant_id before locking so concurrent orders that share
        // variants always acquire row locks in the same order, avoiding a
        // lock-order deadlock (see persistOrder for details).
        const itemsToLock = [...resolvedItems].sort((a, b) =>
          a.variant_id.localeCompare(b.variant_id),
        );
        for (const item of itemsToLock) {
          await this.decrementStock(manager, item, variantMap);
        }

        let discountAmount = new Big(0);
        for (const discount of order.discounts) {
          if (
            discount.minOrderValue !== null &&
            subtotal < Number(discount.minOrderValue)
          ) {
            throw new BadRequestException(
              `Order no longer meets the minimum value for discount code "${discount.code}"`,
            );
          }
          discountAmount = discountAmount.plus(
            this.discountsService.computeAmount(discount, subtotal),
          );
        }

        await manager.delete(OrderItem, { order_id: order.id });
        await manager.save(
          OrderItem,
          resolvedItems.map((item) =>
            manager.create(OrderItem, { ...item, order_id: order.id }),
          ),
        );

        order.subtotal = subtotal;
        order.discount = toMoney(discountAmount);
        order.total = toMoney(
          new Big(subtotal)
            .plus(Number(order.shippingFee))
            .minus(discountAmount),
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
        notes: order.notes,
        subtotal: order.subtotal,
        discount: order.discount,
        total: order.total,
      });

      return this.findOrderOrThrow(manager, order.id);
    });
  }

  async cancel(id: string, userId: string): Promise<Order> {
    const order = await this.findOne(id, userId);

    if (!CANCELLABLE_STATUSES.includes(order.status)) {
      throw new BadRequestException(
        `Cannot cancel order with status "${order.status}"`,
      );
    }

    const fromStatus = order.status;

    const updated = await this.dataSource.transaction(async (manager) => {
      await this.restoreStock(order, manager);

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

    void this.notifyOrderStatusUpdate(updated, fromStatus);

    return updated;
  }

  async updateStatus(
    id: string,
    dto: UpdateOrderStatusDto,
    actor: { actorType: OrderStatusChangeActor; actorId?: string },
  ): Promise<Order> {
    const order = await this.findOne(id);

    const allowedNext = ALLOWED_TRANSITIONS[order.status];
    if (!allowedNext.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition order from "${order.status}" to "${dto.status}"`,
      );
    }

    const fromStatus = order.status;

    const updated = await this.dataSource.transaction(async (manager) => {
      if (dto.status === OrderStatus.CANCELLED) {
        await this.restoreStock(order, manager);
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

    void this.notifyOrderStatusUpdate(updated, fromStatus);

    return updated;
  }

  /**
   * For other modules (e.g. payments) that need to move an order's status
   * as a side effect of their own action, while still recording it in the
   * order's audit trail.
   */
  async applyStatusChange(
    orderId: string,
    toStatus: OrderStatus,
    actor: {
      actorType: OrderStatusChangeActor;
      actorId?: string;
      note?: string;
    },
  ): Promise<Order> {
    const { order, fromStatus } = await this.dataSource.transaction(
      async (manager) => {
        const order = await manager.findOne(Order, {
          where: { id: orderId },
        });
        if (!order) throw new NotFoundException('Order not found');
        if (order.status === toStatus) return { order, fromStatus: null };

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
      },
    );

    if (fromStatus !== null) {
      void this.notifyOrderStatusUpdate(order, fromStatus);
    }

    return order;
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
  }

  // Atomic conditional decrement: only succeeds if enough stock remains AND
  // the variant is still active, preventing oversell and closing the race
  // where a variant is deactivated after `resolveOrderItems` read it but
  // before this transaction commits.
  private async decrementStock(
    manager: EntityManager,
    item: ResolvedOrderItem,
    variantMap: Map<string, ProductVariant>,
  ): Promise<void> {
    const updateResult = await manager
      .createQueryBuilder()
      .update(ProductVariant)
      .set({ stock: () => 'stock - :qty' })
      .where('id = :id AND stock >= :qty AND "isActive" = true', {
        id: item.variant_id,
        qty: item.quantity,
      })
      .execute();

    if (updateResult.affected === 0) {
      const sku = variantMap.get(item.variant_id)?.sku ?? item.variant_id;
      const current = await manager.findOne(ProductVariant, {
        where: { id: item.variant_id },
      });

      if (current && !current.isActive) {
        throw new UnprocessableEntityException(
          `Variant ${sku} is no longer available`,
        );
      }
      throw new UnprocessableEntityException(
        `Insufficient stock for variant ${sku}`,
      );
    }
  }

  private async restoreStock(
    order: Order,
    manager: EntityManager,
  ): Promise<void> {
    const items = order.items?.length
      ? order.items
      : await manager.find(OrderItem, { where: { order_id: order.id } });

    for (const item of items) {
      if (item.variant_id) {
        await manager.increment(
          ProductVariant,
          { id: item.variant_id },
          'stock',
          item.quantity,
        );
      }
    }
  }

  private async notifyOrderConfirmation(order: Order): Promise<void> {
    try {
      const user = await this.usersService.findById(order.user_id);
      if (!user) return;

      await this.mailService.sendOrderConfirmation(user.email, {
        orderNumber: order.orderNumber,
        items: order.items.map((item) => ({
          productName: item.productName,
          variantName: item.variantName,
          quantity: item.quantity,
          unitPrice: Number(item.unitPrice),
          total: Number(item.total),
        })),
        subtotal: Number(order.subtotal),
        shippingFee: Number(order.shippingFee),
        discount: Number(order.discount),
        total: Number(order.total),
      });
    } catch (error) {
      this.logger.error(
        `Failed to notify order confirmation for order ${order.orderNumber}`,
        error instanceof Error ? error.stack : error,
      );
    }
  }

  private async notifyOrderStatusUpdate(
    order: Order,
    fromStatus: OrderStatus | null,
  ): Promise<void> {
    try {
      const user = await this.usersService.findById(order.user_id);
      if (!user) return;

      await this.mailService.sendOrderStatusUpdate(user.email, {
        orderNumber: order.orderNumber,
        fromStatus,
        toStatus: order.status,
      });
    } catch (error) {
      this.logger.error(
        `Failed to notify order status update for order ${order.orderNumber}`,
        error instanceof Error ? error.stack : error,
      );
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
