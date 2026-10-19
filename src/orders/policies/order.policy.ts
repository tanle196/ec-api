import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Discount } from '@/discounts/entities/discount.entity';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { Order } from '../entities/order.entity';
import { OrderStatus } from '../enums/order-status.enum';

// Business rules for orders. Lookups, locking, stock bookkeeping and
// persistence stay in OrdersService; this class decides whether an order may
// be placed, edited, cancelled or moved to another status.
@Injectable()
export class OrderPolicy {
  private static readonly CANCELLABLE_STATUSES: OrderStatus[] = [
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
  ];

  // Valid forward-moving transitions for admin status updates; anything not
  // listed here (e.g. moving backwards, or out of a terminal status) is
  // rejected. REFUNDED / PARTIALLY_REFUNDED are deliberately absent: they're
  // derived from real Refund records and only set by the payment refund flow
  // (via applyStatusChange). Letting an admin set them here would mark an
  // order refunded without any money actually being returned.
  private static readonly ALLOWED_TRANSITIONS: Record<
    OrderStatus,
    OrderStatus[]
  > = {
    [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
    [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
    [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED, OrderStatus.CANCELLED],
    [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED],
    [OrderStatus.DELIVERED]: [],
    [OrderStatus.CANCELLED]: [],
    [OrderStatus.PARTIALLY_REFUNDED]: [],
    [OrderStatus.REFUNDED]: [],
  };

  // ── Ownership ─────────────────────────────────────────────

  assertOwnedBy(order: Pick<Order, 'user_id'>, userId: string): void {
    if (order.user_id !== userId) throw new ForbiddenException();
  }

  // ── Placing ───────────────────────────────────────────────

  assertCartNotEmpty(items: unknown[]): void {
    if (!items.length) throw new BadRequestException('Cart is empty');
  }

  assertVariantOrderable(
    variant: Pick<ProductVariant, 'isActive' | 'sku'>,
  ): void {
    if (!variant.isActive)
      throw new UnprocessableEntityException(
        `Variant ${variant.sku} is inactive`,
      );
  }

  // ── Editing ───────────────────────────────────────────────

  assertEditable(order: Pick<Order, 'status'>): void {
    if (order.status !== OrderStatus.PENDING)
      throw new BadRequestException(
        `Cannot edit an order with status "${order.status}"`,
      );
  }

  // A discount already applied to the order must still be satisfied after
  // its items change.
  assertStillMeetsDiscountMinimum(
    discount: Pick<Discount, 'minOrderValue' | 'code'>,
    subtotal: number,
  ): void {
    if (
      discount.minOrderValue !== null &&
      subtotal < Number(discount.minOrderValue)
    )
      throw new BadRequestException(
        `Order no longer meets the minimum value for discount code "${discount.code}"`,
      );
  }

  // ── Status ────────────────────────────────────────────────

  assertCancellable(order: Pick<Order, 'status'>): void {
    if (!OrderPolicy.CANCELLABLE_STATUSES.includes(order.status))
      throw new BadRequestException(
        `Cannot cancel order with status "${order.status}"`,
      );
  }

  assertCanTransition(from: OrderStatus, to: OrderStatus): void {
    if (!OrderPolicy.ALLOWED_TRANSITIONS[from].includes(to))
      throw new BadRequestException(
        `Cannot transition order from "${from}" to "${to}"`,
      );
  }

  // For status changes driven by other modules (applyStatusChange), which
  // enforce no transition table. A payment-confirmation event (the only
  // caller that ever targets CONFIRMED) only makes sense while the order is
  // still PENDING — otherwise a redelivered/reprocessed webhook event arriving
  // after the order legitimately moved on to PROCESSING/SHIPPED/... — or was
  // CANCELLED — would silently force it backward, corrupting fulfillment
  // state. Callers treat `false` as a no-op rather than an error so the
  // payment itself is still persisted.
  canApplyExternalStatusChange(from: OrderStatus, to: OrderStatus): boolean {
    return !(to === OrderStatus.CONFIRMED && from !== OrderStatus.PENDING);
  }
}
