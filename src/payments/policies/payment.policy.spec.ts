import { BadRequestException, ForbiddenException } from '@nestjs/common';
import Big from 'big.js';
import { OrderStatus } from '@/orders/enums/order-status.enum';
import { PaymentStatus } from '../enums/payment-status.enum';
import { PaymentPolicy } from './payment.policy';

describe('PaymentPolicy', () => {
  const policy = new PaymentPolicy();

  it('assertOrderOwnedBy rejects other users', () => {
    expect(() =>
      policy.assertOrderOwnedBy({ user_id: 'user-1' }, 'user-1'),
    ).not.toThrow();
    expect(() =>
      policy.assertOrderOwnedBy({ user_id: 'user-1' }, 'user-2'),
    ).toThrow(ForbiddenException);
  });

  it.each([
    OrderStatus.CANCELLED,
    OrderStatus.REFUNDED,
    OrderStatus.PARTIALLY_REFUNDED,
  ])('assertOrderPayable rejects %s orders', (status) => {
    expect(() => policy.assertOrderPayable({ status })).toThrow(
      BadRequestException,
    );
  });

  it('assertOrderPayable allows a pending order', () => {
    expect(() =>
      policy.assertOrderPayable({ status: OrderStatus.PENDING }),
    ).not.toThrow();
  });

  it('assertStatusAssignable blocks refund-derived statuses', () => {
    expect(() =>
      policy.assertStatusAssignable(PaymentStatus.COMPLETED),
    ).not.toThrow();
    expect(() => policy.assertStatusAssignable(PaymentStatus.REFUNDED)).toThrow(
      BadRequestException,
    );
    expect(() =>
      policy.assertStatusAssignable(PaymentStatus.PARTIALLY_REFUNDED),
    ).toThrow(BadRequestException);
  });

  it('treats completed and refunded payments as terminal', () => {
    expect(policy.isTerminal(PaymentStatus.PENDING)).toBe(false);
    expect(policy.isTerminal(PaymentStatus.FAILED)).toBe(false);
    expect(policy.isTerminal(PaymentStatus.COMPLETED)).toBe(true);
    expect(() =>
      policy.assertNotTerminal({ status: PaymentStatus.REFUNDED }),
    ).toThrow(BadRequestException);
  });

  it('only completed or partially refunded payments are refundable', () => {
    expect(policy.isRefundable(PaymentStatus.COMPLETED)).toBe(true);
    expect(policy.isRefundable(PaymentStatus.PARTIALLY_REFUNDED)).toBe(true);
    expect(policy.isRefundable(PaymentStatus.REFUNDED)).toBe(false);
    expect(() =>
      policy.assertRefundable({ status: PaymentStatus.PENDING }),
    ).toThrow(BadRequestException);
  });

  it('assertNoDuplicateRefundItems rejects a repeated item', () => {
    expect(() =>
      policy.assertNoDuplicateRefundItems([
        { order_item_id: 'a' },
        { order_item_id: 'b' },
      ]),
    ).not.toThrow();
    expect(() =>
      policy.assertNoDuplicateRefundItems([
        { order_item_id: 'a' },
        { order_item_id: 'a' },
      ]),
    ).toThrow('Order item a is listed more than once');
  });

  it('assertRefundQuantityAvailable caps at the refundable quantity', () => {
    expect(() =>
      policy.assertRefundQuantityAvailable('Shirt', 2, 2),
    ).not.toThrow();
    expect(() => policy.assertRefundQuantityAvailable('Shirt', 3, 2)).toThrow(
      BadRequestException,
    );
  });

  it('assertWithinRefundableBalance compares exact decimals', () => {
    expect(() =>
      policy.assertWithinRefundableBalance(60.1, new Big('39.9'), 100),
    ).not.toThrow();
    expect(() =>
      policy.assertWithinRefundableBalance(60.1, new Big('39.91'), 100),
    ).toThrow(BadRequestException);
  });
});
