import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import Big from 'big.js';
import { Order } from '@/orders/entities/order.entity';
import { OrderStatus } from '@/orders/enums/order-status.enum';
import { Payment } from '../entities/payment.entity';
import { PaymentStatus } from '../enums/payment-status.enum';

// Business rules for payments and refunds. Lookups, locking, gateway calls,
// refund amount calculation and persistence stay in PaymentsService; this
// class decides whether a payment may be created, changed or refunded.
@Injectable()
export class PaymentPolicy {
  // A payment in any of these statuses has already been settled one way or
  // another (paid in full, or resolved via the refund flow) and must not be
  // mutated by updateStatus/completeFromGatewayEvent/failFromGatewayEvent —
  // kept as one shared list so the call sites can't drift out of sync.
  private static readonly TERMINAL_STATUSES: PaymentStatus[] = [
    PaymentStatus.COMPLETED,
    PaymentStatus.PARTIALLY_REFUNDED,
    PaymentStatus.REFUNDED,
  ];

  private static readonly REFUNDABLE_STATUSES: PaymentStatus[] = [
    PaymentStatus.COMPLETED,
    PaymentStatus.PARTIALLY_REFUNDED,
  ];

  private static readonly UNPAYABLE_ORDER_STATUSES: OrderStatus[] = [
    OrderStatus.CANCELLED,
    OrderStatus.REFUNDED,
    OrderStatus.PARTIALLY_REFUNDED,
  ];

  // partially_refunded/refunded are system-derived statuses: they're only
  // ever set by createRefund/refundFromGatewayEvent alongside an actual
  // Refund record, the corresponding gateway call, and the matching order
  // sync. Allowing an admin to set either directly would let a payment claim
  // to be (partially) refunded with no money actually returned and no Refund
  // row behind it — and since only COMPLETED/PARTIALLY_REFUNDED payments are
  // refundable, setting REFUNDED would also permanently block the real
  // refund flow from ever fixing it.
  private static readonly SYSTEM_ONLY_STATUSES: PaymentStatus[] = [
    PaymentStatus.PARTIALLY_REFUNDED,
    PaymentStatus.REFUNDED,
  ];

  // ── Ownership ─────────────────────────────────────────────

  assertOrderOwnedBy(order: Pick<Order, 'user_id'>, userId: string): void {
    if (order.user_id !== userId) throw new ForbiddenException();
  }

  // ── Creating ──────────────────────────────────────────────

  assertOrderPayable(order: Pick<Order, 'status'>): void {
    if (PaymentPolicy.UNPAYABLE_ORDER_STATUSES.includes(order.status))
      throw new BadRequestException(
        `Cannot pay for an order with status "${order.status}"`,
      );
  }

  // ── Status ────────────────────────────────────────────────

  isTerminal(status: PaymentStatus): boolean {
    return PaymentPolicy.TERMINAL_STATUSES.includes(status);
  }

  assertStatusAssignable(status: PaymentStatus): void {
    if (PaymentPolicy.SYSTEM_ONLY_STATUSES.includes(status))
      throw new BadRequestException(
        `Status "${status}" is set automatically by the refund flow and cannot be assigned directly`,
      );
  }

  assertNotTerminal(payment: Pick<Payment, 'status'>): void {
    if (this.isTerminal(payment.status))
      throw new BadRequestException(
        `Cannot update a payment with status "${payment.status}"`,
      );
  }

  // ── Refunds ───────────────────────────────────────────────

  isRefundable(status: PaymentStatus): boolean {
    return PaymentPolicy.REFUNDABLE_STATUSES.includes(status);
  }

  assertRefundable(payment: Pick<Payment, 'status'>): void {
    if (!this.isRefundable(payment.status))
      throw new BadRequestException(
        `Cannot refund a payment with status "${payment.status}"`,
      );
  }

  assertNoDuplicateRefundItems(items: { order_item_id: string }[]): void {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.order_item_id))
        throw new BadRequestException(
          `Order item ${item.order_item_id} is listed more than once`,
        );
      seen.add(item.order_item_id);
    }
  }

  assertRefundQuantityAvailable(
    productName: string,
    requested: number,
    refundable: number,
  ): void {
    if (requested > refundable)
      throw new BadRequestException(
        `Cannot refund ${requested} of "${productName}" — only ${refundable} left refundable`,
      );
  }

  assertWithinRefundableBalance(
    committedTotal: number,
    amount: Big | number,
    paymentAmount: number,
  ): void {
    if (new Big(committedTotal).plus(amount).gt(paymentAmount))
      throw new BadRequestException(
        'Refund amount exceeds the remaining refundable balance',
      );
  }
}
