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

/**
 * Formats a monetary value for display (emails, etc). `Intl` knows each
 * currency's minor-unit count, so VND renders as "150.000 ₫" (no decimals)
 * while USD renders as "$49.99" — unlike a hard-coded `toFixed(2)`.
 */
export function formatMoney(
  value: Big | number | string,
  currency: string,
): string {
  const code = currency.toUpperCase();
  return new Intl.NumberFormat(code === 'VND' ? 'vi-VN' : 'en-US', {
    style: 'currency',
    currency: code,
  }).format(toMoney(value));
}

/**
 * TypeORM column transformer for `decimal` money columns. The `pg` driver
 * returns `decimal` as a string (to avoid float precision loss), which
 * silently breaks code that treats the entity field as a `number`. This
 * converts it back to a number on read; nulls pass through.
 */
export const moneyTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null): number | null =>
    value === null ? null : Number(value),
};
