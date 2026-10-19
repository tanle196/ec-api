import {
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderPolicy } from './order.policy';

describe('OrderPolicy', () => {
  const policy = new OrderPolicy();

  it('assertOwnedBy rejects other users', () => {
    expect(() =>
      policy.assertOwnedBy({ user_id: 'user-1' }, 'user-1'),
    ).not.toThrow();
    expect(() => policy.assertOwnedBy({ user_id: 'user-1' }, 'user-2')).toThrow(
      ForbiddenException,
    );
  });

  it('assertCartNotEmpty rejects an empty cart', () => {
    expect(() => policy.assertCartNotEmpty([{}])).not.toThrow();
    expect(() => policy.assertCartNotEmpty([])).toThrow('Cart is empty');
  });

  it('assertVariantOrderable rejects inactive variants', () => {
    expect(() =>
      policy.assertVariantOrderable({ isActive: true, sku: 'S' }),
    ).not.toThrow();
    expect(() =>
      policy.assertVariantOrderable({ isActive: false, sku: 'S' }),
    ).toThrow(UnprocessableEntityException);
  });

  it('assertEditable only allows PENDING orders', () => {
    expect(() =>
      policy.assertEditable({ status: OrderStatus.PENDING }),
    ).not.toThrow();
    expect(() =>
      policy.assertEditable({ status: OrderStatus.CONFIRMED }),
    ).toThrow(BadRequestException);
  });

  it('assertStillMeetsDiscountMinimum checks the new subtotal', () => {
    const discount = { code: 'SALE', minOrderValue: 100 };

    expect(() =>
      policy.assertStillMeetsDiscountMinimum(discount, 100),
    ).not.toThrow();
    expect(() =>
      policy.assertStillMeetsDiscountMinimum(
        { code: 'SALE', minOrderValue: null },
        1,
      ),
    ).not.toThrow();
    expect(() => policy.assertStillMeetsDiscountMinimum(discount, 99)).toThrow(
      BadRequestException,
    );
  });

  it.each([OrderStatus.PENDING, OrderStatus.CONFIRMED])(
    'assertCancellable allows %s',
    (status) => {
      expect(() => policy.assertCancellable({ status })).not.toThrow();
    },
  );

  it.each([
    OrderStatus.PROCESSING,
    OrderStatus.SHIPPED,
    OrderStatus.DELIVERED,
    OrderStatus.CANCELLED,
  ])('assertCancellable rejects %s', (status) => {
    expect(() => policy.assertCancellable({ status })).toThrow(
      BadRequestException,
    );
  });

  it('assertCanTransition follows the forward-only table', () => {
    expect(() =>
      policy.assertCanTransition(OrderStatus.PENDING, OrderStatus.CONFIRMED),
    ).not.toThrow();
    expect(() =>
      policy.assertCanTransition(OrderStatus.SHIPPED, OrderStatus.DELIVERED),
    ).not.toThrow();
    expect(() =>
      policy.assertCanTransition(OrderStatus.SHIPPED, OrderStatus.PENDING),
    ).toThrow(BadRequestException);
    expect(() =>
      policy.assertCanTransition(OrderStatus.DELIVERED, OrderStatus.REFUNDED),
    ).toThrow(BadRequestException);
  });

  it('canApplyExternalStatusChange only confirms PENDING orders', () => {
    expect(
      policy.canApplyExternalStatusChange(
        OrderStatus.PENDING,
        OrderStatus.CONFIRMED,
      ),
    ).toBe(true);
    expect(
      policy.canApplyExternalStatusChange(
        OrderStatus.SHIPPED,
        OrderStatus.CONFIRMED,
      ),
    ).toBe(false);
    expect(
      policy.canApplyExternalStatusChange(
        OrderStatus.DELIVERED,
        OrderStatus.REFUNDED,
      ),
    ).toBe(true);
  });
});
