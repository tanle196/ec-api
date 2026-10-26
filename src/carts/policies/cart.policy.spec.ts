import { UnprocessableEntityException } from '@nestjs/common';
import { CartPolicy } from './cart.policy';

describe('CartPolicy', () => {
  const policy = new CartPolicy();

  it('rejects inactive variants', () => {
    expect(() =>
      policy.assertVariantPurchasable({ isActive: true }),
    ).not.toThrow();
    expect(() => policy.assertVariantPurchasable({ isActive: false })).toThrow(
      UnprocessableEntityException,
    );
  });

  it('rejects quantities above the available stock', () => {
    expect(() => policy.assertStockAvailable(5, 5)).not.toThrow();
    expect(() => policy.assertStockAvailable(5, 6)).toThrow(
      'Insufficient stock: available 5, requested 6',
    );
  });
});
