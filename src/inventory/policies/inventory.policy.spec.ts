import {
  BadRequestException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InventoryPolicy } from './inventory.policy';

describe('InventoryPolicy', () => {
  const policy = new InventoryPolicy();

  describe('weightedAverageCost', () => {
    it('blends the receipt into the existing average', () => {
      // 10 @ 100 + 30 @ 120 = 4600 / 40
      expect(policy.weightedAverageCost(10, 100, 30, 120)).toBe(115);
    });

    it('rounds to money precision', () => {
      expect(policy.weightedAverageCost(2, 10, 1, 11)).toBe(10.33);
    });

    it('takes the receipt cost when nothing is on hand', () => {
      expect(policy.weightedAverageCost(0, 100, 5, 80)).toBe(80);
    });

    it('takes the receipt cost when no cost is known yet', () => {
      expect(policy.weightedAverageCost(20, null, 5, 80)).toBe(80);
    });
  });

  describe('resolveAdjustmentDelta', () => {
    const variant = { stock: 8, reserved: 2 }; // on hand 10

    it('turns a stocktake count into a delta from on hand', () => {
      expect(policy.resolveAdjustmentDelta(variant, { onHand: 7 })).toBe(-3);
    });

    it('passes a delta through', () => {
      expect(policy.resolveAdjustmentDelta(variant, { delta: 5 })).toBe(5);
    });

    it.each([[{}], [{ onHand: 1, delta: 1 }]])(
      'requires exactly one of onHand or delta (%o)',
      (input) => {
        expect(() => policy.resolveAdjustmentDelta(variant, input)).toThrow(
          BadRequestException,
        );
      },
    );

    it('rejects a no-op adjustment', () => {
      expect(() =>
        policy.resolveAdjustmentDelta(variant, { onHand: 10 }),
      ).toThrow('Adjustment does not change the stock');
    });

    it('refuses to take on hand below what open orders reserve', () => {
      expect(() =>
        policy.resolveAdjustmentDelta(variant, { onHand: 1 }),
      ).toThrow(UnprocessableEntityException);
      // Exactly down to the reserved units is fine.
      expect(policy.resolveAdjustmentDelta(variant, { onHand: 2 })).toBe(-8);
    });
  });

  it('assertCanShip requires available stock to cover unreserved units', () => {
    expect(() => policy.assertCanShip({ sku: 'A', stock: 1 }, 2)).toThrow(
      'Not enough stock to ship variant A',
    );
    expect(() => policy.assertCanShip({ sku: 'A', stock: 2 }, 2)).not.toThrow();
  });
});
