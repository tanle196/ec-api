import Big from 'big.js';

/**
 * Decimal places money is rounded to across the app (matches the
 * `decimal(12,2)` columns on Order, Payment, Refund, etc). Centralized so
 * every `Big(...).round(...)` call rounds to the same precision.
 */
export const MONEY_DECIMAL_PLACES = 2;

/**
 * Rounds a monetary value to the app's shared precision and returns a plain
 * number. Accepts either a Big instance (to finish a Big.js calculation
 * chain) or a plain number/string. Centralizes the
 * `new Big(x)....round(MONEY_DECIMAL_PLACES).toNumber()` boilerplate that
 * was previously repeated at every money call site.
 */
export function toMoney(value: Big | number | string): number {
  const big = value instanceof Big ? value : new Big(value);
  return big.round(MONEY_DECIMAL_PLACES).toNumber();
}
