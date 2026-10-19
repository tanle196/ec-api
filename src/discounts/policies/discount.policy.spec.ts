import { BadRequestException } from '@nestjs/common';
import { Discount } from '../entities/discount.entity';
import { DiscountType } from '../enums/discount-type.enum';
import { DiscountPolicy } from './discount.policy';

describe('DiscountPolicy', () => {
  const policy = new DiscountPolicy();

  const discount = (overrides: Partial<Discount> = {}) =>
    ({
      isActive: true,
      startsAt: null,
      expiresAt: null,
      usageLimit: null,
      usedCount: 0,
      minOrderValue: null,
      ...overrides,
    }) as Discount;

  const now = new Date('2026-01-15T00:00:00Z');

  it('caps percent discounts at 100', () => {
    expect(() =>
      policy.assertValidValue(DiscountType.PERCENT, 100),
    ).not.toThrow();
    expect(() => policy.assertValidValue(DiscountType.PERCENT, 101)).toThrow(
      BadRequestException,
    );
    expect(() =>
      policy.assertValidValue(DiscountType.FIXED, 500),
    ).not.toThrow();
  });

  describe('assertUsable', () => {
    it('passes for an active, in-window, under-limit code', () => {
      expect(() =>
        policy.assertUsable(
          discount({
            startsAt: new Date('2026-01-01'),
            expiresAt: new Date('2026-02-01'),
            usageLimit: 10,
            usedCount: 9,
            minOrderValue: 100,
          }),
          100,
          now,
        ),
      ).not.toThrow();
    });

    it.each([
      ['inactive', { isActive: false }, 'Discount code is inactive'],
      [
        'not started',
        { startsAt: new Date('2026-02-01') },
        'Discount code is not yet valid',
      ],
      [
        'expired',
        { expiresAt: new Date('2026-01-01') },
        'Discount code has expired',
      ],
      [
        'used up',
        { usageLimit: 3, usedCount: 3 },
        'Discount code has reached its usage limit',
      ],
      [
        'under minimum',
        { minOrderValue: 200 },
        'Minimum order value for this code is 200',
      ],
    ])('rejects a code that is %s', (_, overrides, message) => {
      expect(() =>
        policy.assertUsable(discount(overrides as Partial<Discount>), 100, now),
      ).toThrow(message);
    });
  });
});
