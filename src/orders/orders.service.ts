import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Address } from '@/addresses/entities/address.entity';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { DiscountsService } from '@/discounts/discounts.service';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { TypedConfigService } from '@/config/TypedConfigService';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderListQueryDto } from './dto/order-list-query.dto';
import { UpdateOrderStatusDto } from './dto/update-order-status.dto';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { OrderStatus } from './enums/order-status.enum';

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
    @InjectRepository(OrderItem)
    private readonly itemRepo: Repository<OrderItem>,
    @InjectRepository(Address)
    private readonly addressRepo: Repository<Address>,
    @InjectRepository(ProductVariant)
    private readonly variantRepo: Repository<ProductVariant>,
    private readonly dataSource: DataSource,
    private readonly discountsService: DiscountsService,
    private readonly configService: TypedConfigService,
  ) {}

  async create(userId: string, dto: CreateOrderDto): Promise<Order> {
    const address = await this.addressRepo.findOne({
      where: { id: dto.address_id, user_id: userId },
    });
    if (!address) throw new NotFoundException('Address not found');

    const variantIds = dto.items.map((i) => i.variant_id);
    const variants = await this.variantRepo.find({
      where: variantIds.map((id) => ({ id })),
      relations: ['product'],
    });

    const variantMap = new Map(variants.map((v) => [v.id, v]));

    for (const item of dto.items) {
      const variant = variantMap.get(item.variant_id);
      if (!variant)
        throw new NotFoundException(`Variant ${item.variant_id} not found`);
      if (!variant.isActive)
        throw new UnprocessableEntityException(
          `Variant ${variant.sku} is inactive`,
        );
    }

    let subtotal = 0;
    const orderItems: Partial<OrderItem>[] = [];

    for (const itemDto of dto.items) {
      const variant = variantMap.get(itemDto.variant_id)!;
      const unitPrice = Number(variant.price);
      const itemTotal = unitPrice * itemDto.quantity;
      subtotal += itemTotal;

      orderItems.push({
        variant_id: variant.id,
        productName: variant.product.name,
        variantName: variant.name,
        unitPrice,
        quantity: itemDto.quantity,
        total: itemTotal,
      });
    }

    let discountAmount = 0;
    let discountId: string | undefined;

    if (dto.discountCode) {
      const discountEntity = await this.discountsService.resolveCode(
        dto.discountCode,
        subtotal,
      );
      discountAmount = this.discountsService.computeAmount(
        discountEntity,
        subtotal,
      );
      discountId = discountEntity.id;
    }

    return this.dataSource.transaction(async (manager) => {
      for (const itemDto of dto.items) {
        const variant = variantMap.get(itemDto.variant_id)!;

        // Atomic conditional decrement: only succeeds if enough stock remains,
        // preventing oversell when concurrent orders race on the same variant.
        const updateResult = await manager
          .createQueryBuilder()
          .update(ProductVariant)
          .set({ stock: () => 'stock - :qty' })
          .where('id = :id AND stock >= :qty', {
            id: variant.id,
            qty: itemDto.quantity,
          })
          .execute();

        if (updateResult.affected === 0) {
          throw new UnprocessableEntityException(
            `Insufficient stock for variant ${variant.sku}`,
          );
        }
      }

      const shippingFee = this.configService.getAppConfig().shippingFlatFee;
      const total = subtotal + shippingFee - discountAmount;

      const order = manager.create(Order, {
        user_id: userId,
        address_id: dto.address_id,
        orderNumber: this.generateOrderNumber(),
        status: OrderStatus.PENDING,
        subtotal,
        shippingFee,
        discount: discountAmount,
        total,
        notes: dto.notes ?? null,
      });

      const savedOrder = await manager.save(Order, order);

      await manager.save(
        OrderItem,
        orderItems.map((item) =>
          manager.create(OrderItem, { ...item, order_id: savedOrder.id }),
        ),
      );

      if (discountId) {
        await manager.query(
          `INSERT INTO "order_discount" ("order_id", "discount_id") VALUES ($1, $2)`,
          [savedOrder.id, discountId],
        );
        await this.discountsService.incrementUsedCount(discountId);
      }

      return this.findOne(savedOrder.id);
    });
  }

  async findAll(
    query: OrderListQueryDto,
    requesterId?: string,
    isAdmin = false,
  ): Promise<PaginatedResponseDto<Order>> {
    const { page = 1, limit = 20, status, user_id } = query;

    const qb = this.orderRepo.createQueryBuilder('o');

    if (!isAdmin) {
      qb.andWhere('o.user_id = :userId', { userId: requesterId });
    } else if (user_id) {
      qb.andWhere('o.user_id = :userId', { userId: user_id });
    }

    if (status) qb.andWhere('o.status = :status', { status });

    const [data, total] = await qb
      .orderBy('o.createdAt', 'DESC')
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

    await this.restoreStock(order);
    order.status = OrderStatus.CANCELLED;
    return this.orderRepo.save(order);
  }

  async updateStatus(id: string, dto: UpdateOrderStatusDto): Promise<Order> {
    const order = await this.findOne(id);

    const allowedNext = ALLOWED_TRANSITIONS[order.status];
    if (!allowedNext.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot transition order from "${order.status}" to "${dto.status}"`,
      );
    }

    if (dto.status === OrderStatus.CANCELLED) {
      await this.restoreStock(order);
    }

    order.status = dto.status;
    return this.orderRepo.save(order);
  }

  private async restoreStock(order: Order): Promise<void> {
    const items = order.items?.length
      ? order.items
      : await this.itemRepo.find({ where: { order_id: order.id } });

    for (const item of items) {
      if (item.variant_id) {
        await this.variantRepo.increment(
          { id: item.variant_id },
          'stock',
          item.quantity,
        );
      }
    }
  }

  private generateOrderNumber(): string {
    const date = new Date();
    const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).slice(2, 8).toUpperCase();
    return `ORD-${datePart}-${random}`;
  }
}
