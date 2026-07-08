import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { Address } from '@/addresses/entities/address.entity';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { DiscountsService } from '@/discounts/discounts.service';
import { CartsService } from '@/carts/carts.service';
import { CartItem } from '@/carts/entities/cart-item.entity';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
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
  [OrderStatus.REFUNDED]: [],
};

@Injectable()
export class OrdersService {
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

    let subtotal = 0;
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
      const itemTotal = unitPrice * item.quantity;
      subtotal += itemTotal;

      resolvedItems.push({
        variant_id: variant.id,
        productName: variant.product.name,
        variantName: variant.name,
        unitPrice,
        quantity: item.quantity,
        total: itemTotal,
      });
    }

    return { subtotal, resolvedItems, variantMap };
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
    for (const item of params.resolvedItems) {
      // Atomic conditional decrement: only succeeds if enough stock remains,
      // preventing oversell when concurrent orders race on the same variant.
      const updateResult = await manager
        .createQueryBuilder()
        .update(ProductVariant)
        .set({ stock: () => 'stock - :qty' })
        .where('id = :id AND stock >= :qty', {
          id: item.variant_id,
          qty: item.quantity,
        })
        .execute();

      if (updateResult.affected === 0) {
        const sku =
          params.variantMap.get(item.variant_id)?.sku ?? item.variant_id;
        throw new UnprocessableEntityException(
          `Insufficient stock for variant ${sku}`,
        );
      }
    }

    const shippingFee = this.configService.getAppConfig().shippingFlatFee;
    const total = params.subtotal + shippingFee - params.discountAmount;

    const order = manager.create(Order, {
      user_id: params.userId,
      address_id: params.addressId,
      orderNumber: this.generateOrderNumber(),
      status: OrderStatus.PENDING,
      subtotal: params.subtotal,
      shippingFee,
      discount: params.discountAmount,
      total,
      notes: params.notes ?? null,
    });

    const savedOrder = await manager.save(Order, order);

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
      await this.discountsService.incrementUsedCount(params.discountId);
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

    return this.findOne(savedOrder.id);
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

  async findOne(id: string, userId?: string): Promise<Order> {
    const order = await this.orderRepo.findOne({
      where: { id },
      relations: ['items', 'address', 'discounts'],
    });

    if (!order) throw new NotFoundException('Order not found');
    if (userId && order.user_id !== userId) throw new ForbiddenException();

    return order;
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

      return this.findOne(order.id);
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

      return this.findOne(order.id);
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
  }

  private async notifyOrderStatusUpdate(
    order: Order,
    fromStatus: OrderStatus | null,
  ): Promise<void> {
    const user = await this.usersService.findById(order.user_id);
    if (!user) return;

    await this.mailService.sendOrderStatusUpdate(user.email, {
      orderNumber: order.orderNumber,
      fromStatus,
      toStatus: order.status,
    });
  }

  private generateOrderNumber(): string {
    const date = new Date();
    const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ORD-${datePart}-${random}`;
  }
}
