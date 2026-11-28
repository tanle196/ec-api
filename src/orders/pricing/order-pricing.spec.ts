import { allocateOrderLines } from './order-pricing';

const sum = (values: number[]) =>
  Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

describe('allocateOrderLines', () => {
  it('spreads shipping by line total and derives paidAmount', () => {
    expect(allocateOrderLines([100, 300], [10, 30], 20)).toEqual([
      { discountAmount: 10, shippingAmount: 5, paidAmount: 95 },
      { discountAmount: 30, shippingAmount: 15, paidAmount: 285 },
    ]);
  });

  it('paidAmounts sum to the order total', () => {
    const totals = [19.99, 59.97, 7.5];
    const discounts = [0, 12.34, 1.11];
    const lines = allocateOrderLines(totals, discounts, 5);
    expect(sum(lines.map((l) => l.paidAmount))).toBe(
      Math.round((sum(totals) - sum(discounts) + 5) * 100) / 100,
    );
  });

  it('rejects mismatched inputs', () => {
    expect(() => allocateOrderLines([1, 2], [0], 0)).toThrow();
  });
});
