import Big from 'big.js';
import { MONEY_DECIMAL_PLACES, toMoney } from './money.util';

/**
 * Splits `amount` across lines in proportion to `weights`, rounding each
 * share to money precision and guaranteeing the shares sum to exactly
 * `amount`.
 *
 * Rounding each share independently drifts (e.g. 10 split three ways is
 * 3.33 + 3.33 + 3.33 = 9.99), so the residual is pushed onto the line with
 * the largest weight (first one on ties): it is the line where an extra
 * cent is proportionally smallest. Lines with weight 0 always get 0, unless
 * every weight is 0 — then the whole amount goes to the first line so it
 * is never silently dropped.
 */
export function allocateProportionally(
  amount: number,
  weights: number[],
): number[] {
  if (weights.length === 0) return [];
  if (weights.some((w) => w < 0)) {
    throw new Error('Allocation weights must be non-negative');
  }

  const total = weights.reduce((sum, w) => sum.plus(w), new Big(0));
  const target = new Big(amount).round(MONEY_DECIMAL_PLACES);

  if (total.eq(0)) {
    return weights.map((_, i) => (i === 0 ? target.toNumber() : 0));
  }

  const shares = weights.map((w) =>
    target.times(w).div(total).round(MONEY_DECIMAL_PLACES),
  );

  const allocated = shares.reduce((sum, s) => sum.plus(s), new Big(0));
  const residual = target.minus(allocated);

  if (!residual.eq(0)) {
    let largest = 0;
    for (let i = 1; i < weights.length; i++) {
      if (weights[i] > weights[largest]) largest = i;
    }
    shares[largest] = shares[largest].plus(residual);
  }

  return shares.map((s) => toMoney(s));
}

/**
 * Amount attributable to units `[from, to)` of a line whose `quantity`
 * units together cost `lineAmount`.
 *
 * Computed as a difference of cumulative roundings rather than
 * `round(lineAmount * units / quantity)` so that taking a line apart in any
 * number of slices always adds back up to exactly `lineAmount` — e.g. three
 * single-unit refunds of a 3-unit, 10.00 line give 3.33 + 3.34 + 3.33.
 */
export function amountForUnits(
  lineAmount: number,
  quantity: number,
  from: number,
  to: number,
): number {
  if (quantity <= 0) return 0;
  const cumulative = (units: number) =>
    new Big(lineAmount).times(units).div(quantity).round(MONEY_DECIMAL_PLACES);
  return toMoney(cumulative(to).minus(cumulative(from)));
}
