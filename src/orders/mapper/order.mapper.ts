import { Discount } from '@/discounts/entities/discount.entity';
import {
  AppliedDiscountDto,
  OrderItemResponseDto,
  OrderListItemDto,
  OrderResponseDto,
} from '../dto/order-response.dto';
import { OrderStatusHistoryResponseDto } from '../dto/order-status-history-response.dto';
import { OrderItem } from '../entities/order-item.entity';
import { OrderStatusHistory } from '../entities/order-status-history.entity';
import { Order } from '../entities/order.entity';

export class OrderMapper {
  // Only what the customer needs to see about an applied code — usage limits,
  // counters and validity windows stay internal.
  static toAppliedDiscount = (discount: Discount): AppliedDiscountDto => ({
    id: discount.id,
    code: discount.code,
    type: discount.type,
    value: discount.value,
  });

  static toItem = (item: OrderItem): OrderItemResponseDto => ({
    id: item.id,
    order_id: item.order_id,
    variant_id: item.variant_id,
    productName: item.productName,
    variantName: item.variantName,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    total: item.total,
  });

  static toResponse = (entity: Order): OrderResponseDto => ({
    id: entity.id,
    user_id: entity.user_id,
    address_id: entity.address_id,
    orderNumber: entity.orderNumber,
    status: entity.status,
    subtotal: entity.subtotal,
    shippingFee: entity.shippingFee,
    discount: entity.discount,
    total: entity.total,
    notes: entity.notes,
    items: (entity.items ?? []).map(OrderMapper.toItem),
    discounts: (entity.discounts ?? []).map(OrderMapper.toAppliedDiscount),
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });

  static toListItem = (entity: Order): OrderListItemDto => ({
    id: entity.id,
    user_id: entity.user_id,
    orderNumber: entity.orderNumber,
    status: entity.status,
    total: entity.total,
    createdAt: entity.createdAt,
  });

  static toStatusHistory = (
    entity: OrderStatusHistory,
  ): OrderStatusHistoryResponseDto => ({
    id: entity.id,
    order_id: entity.order_id,
    fromStatus: entity.fromStatus,
    toStatus: entity.toStatus,
    changedByType: entity.changedByType,
    changedById: entity.changedById,
    note: entity.note,
    createdAt: entity.createdAt,
  });

  static toStatusHistoryList = (
    entities: OrderStatusHistory[],
  ): OrderStatusHistoryResponseDto[] =>
    entities.map(OrderMapper.toStatusHistory);
}
