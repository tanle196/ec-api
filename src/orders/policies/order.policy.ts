import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Discount } from '@/discounts/entities/discount.entity';
import { Payment } from '@/payments/entities/payment.entity';
import { PaymentMethod } from '@/payments/enums/payment-method.enum';
import { PaymentStatus } from '@/payments/enums/payment-status.enum';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { Order } from '../entities/order.entity';
import { OrderStatus } from '../enums/order-status.enum';

// Business rules for orders. Lookups, locking, stock bookkeeping and
// persistence stay in OrdersService; this class decides whether an order may
// be placed, edited, cancelled or moved to another status.
@Injectable()
export class OrderPolicy {
  // Settled offline (cash on delivery, or a transfer staff check by hand):
  // orders paying this way wait for staff instead of expiring.
  static readonly OFFLINE_PAYMENT_METHODS: PaymentMethod[] = [
    PaymentMethod.COD,
    PaymentMethod.BANK_TRANSFER,
  ];

  // Money has been taken; the order must go through the refund flow.
  static readonly PAID_PAYMENT_STATUSES: PaymentStatus[] = [
    PaymentStatus.COMPLETED,
    PaymentStatus.PARTIALLY_REFUNDED,
    PaymentStatus.REFUNDED,
  ];

  /**
   * Whether an unpaid order has held its stock long enough and should be
   * cancelled automatically: still PENDING, placed before `cutoff`, not
   * paid, and not waiting on an offline payment method. An order with no
   * payment at all (the customer never got to the payment step) expires
   * too.
   */
  isExpired(
    order: Pick<Order, 'status' | 'createdAt'>,
    payments: Pick<Payment, 'method' | 'status'>[],
    cutoff: Date,
  ): boolean {
    if (order.status !== OrderStatus.PENDING) return false;
    if (order.createdAt >= cutoff) return false;
    return !payments.some(
      (p) =>
        OrderPolicy.OFFLINE_PAYMENT_METHODS.includes(p.method) ||
        OrderPolicy.PAID_PAYMENT_STATUSES.includes(p.status),
    );
  }

  private static readonly CANCELLABLE_STATUSES: OrderStatus[] = [
    OrderStatus.PENDING,
    OrderStatus.CONFIRMED,
  ];

  // Transitions staff can make by hand (updateStatus). Anything not
  // listed (moving backwards, out of a terminal status) is rejected.
  // - Shipping statuses (shipped, delivered, delivery_failed,
  //   returned_to_sender) are driven by the order's shipment; see
  //   SHIPMENT_TRANSITIONS.
  // - refunded / partially_refunded come only from the refund flow, backed
  //   by real Refund records.
  // - completed is set by the return-window job.
  private static readonly ALLOWED_TRANSITIONS: Record<
    OrderStatus,
    OrderStatus[]
  > = {
    [OrderStatus.PENDING]: [OrderStatus.CONFIRMED, OrderStatus.CANCELLED],
    [OrderStatus.CONFIRMED]: [OrderStatus.PROCESSING, OrderStatus.CANCELLED],
    [OrderStatus.PROCESSING]: [OrderStatus.CANCELLED],
    [OrderStatus.SHIPPED]: [],
    [OrderStatus.DELIVERED]: [],
    [OrderStatus.DELIVERY_FAILED]: [],
    [OrderStatus.RETURNED_TO_SENDER]: [],
    [OrderStatus.COMPLETED]: [],
    [OrderStatus.CANCELLED]: [],
    [OrderStatus.PARTIALLY_REFUNDED]: [],
    [OrderStatus.REFUNDED]: [],
  };

  // Order transitions a shipment status change may cause.
  private static readonly SHIPMENT_TRANSITIONS: Partial<
    Record<OrderStatus, OrderStatus[]>
  > = {
    [OrderStatus.PROCESSING]: [OrderStatus.SHIPPED],
    [OrderStatus.SHIPPED]: [OrderStatus.DELIVERED, OrderStatus.DELIVERY_FAILED],
    [OrderStatus.DELIVERY_FAILED]: [
      OrderStatus.SHIPPED,
      OrderStatus.DELIVERED,
      OrderStatus.RETURNED_TO_SENDER,
    ],
  };

  // Shipping statuses staff still pick from the order status dropdown; the
  // admin API turns them into shipment actions.
  static readonly SHIPMENT_DRIVEN_STATUSES: OrderStatus[] = [
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
  ];

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

  // Delivered, and the return window (ending at `cutoff`) is over.
  isCompletable(
    order: Pick<Order, 'status' | 'deliveredAt'>,
    cutoff: Date,
  ): boolean {
    return (
      order.status === OrderStatus.DELIVERED &&
      order.deliveredAt !== null &&
      order.deliveredAt < cutoff
    );
  }

  assertShipmentTransition(from: OrderStatus, to: OrderStatus): void {
    if (!(OrderPolicy.SHIPMENT_TRANSITIONS[from] ?? []).includes(to))
      throw new BadRequestException(
        `Cannot move order from "${from}" to "${to}" by shipment`,
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
