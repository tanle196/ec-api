import { allocateProportionally, amountForUnits } from './allocation.util';

const sum = (values: number[]) =>
  Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

describe('allocateProportionally', () => {
  it('splits in proportion to the weights', () => {
    expect(allocateProportionally(30, [100, 200])).toEqual([10, 20]);
  });

  it('pushes the rounding residual onto the largest line', () => {
    const shares = allocateProportionally(10, [1, 1, 1]);
    expect(shares).toEqual([3.34, 3.33, 3.33]);
    expect(sum(shares)).toBe(10);
  });

  it('puts the residual on the largest weight, not the first', () => {
    const shares = allocateProportionally(10, [1, 5, 1]);
    expect(sum(shares)).toBe(10);
    expect(shares[1]).toBeGreaterThan(shares[0]);
  });

  it('gives zero-weight lines nothing', () => {
    expect(allocateProportionally(50, [0, 100, 0])).toEqual([0, 50, 0]);
  });

  it('assigns the whole amount to the first line when all weights are 0', () => {
    expect(allocateProportionally(5, [0, 0])).toEqual([5, 0]);
  });

  it('returns an empty list for no lines', () => {
    expect(allocateProportionally(5, [])).toEqual([]);
  });

  it('rejects negative weights', () => {
    expect(() => allocateProportionally(5, [1, -1])).toThrow();
  });

  it('always sums exactly to the amount', () => {
    const weights = [19.99, 7.5, 133.33, 0.01, 42];
    for (const amount of [0, 0.01, 1, 9.99, 33.33, 100, 12345.67]) {
      expect(sum(allocateProportionally(amount, weights))).toBe(amount);
    }
  });
});

describe('amountForUnits', () => {
  it('prorates a slice of a line', () => {
    expect(amountForUnits(30, 3, 0, 1)).toBe(10);
  });

  it('reassembles a line exactly from single-unit slices', () => {
    const slices = [0, 1, 2].map((i) => amountForUnits(10, 3, i, i + 1));
    expect(sum(slices)).toBe(10);
  });

  it('returns the full line for the full range', () => {
    expect(amountForUnits(19.99, 7, 0, 7)).toBe(19.99);
  });

  it('returns 0 for a zero-quantity line', () => {
    expect(amountForUnits(10, 0, 0, 0)).toBe(0);
  });
});
