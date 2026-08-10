/**
 * Decimal places money is rounded to across the app (matches the
 * `decimal(12,2)` columns on Order, Payment, Refund, etc). Centralized so
 * every `Big(...).round(...)` call rounds to the same precision.
 */
export const MONEY_DECIMAL_PLACES = 2;
