import Big from 'big.js';

// Stripe's zero-decimal currencies — the smallest unit already IS the
// display unit, so no *100 conversion is applied.
// https://docs.stripe.com/currencies#zero-decimal
const ZERO_DECIMAL_CURRENCIES = new Set([
  'bif',
  'clp',
  'djf',
  'gnf',
  'jpy',
  'kmf',
  'krw',
  'mga',
  'pyg',
  'rwf',
  'ugx',
  'vnd',
  'vuv',
  'xaf',
  'xof',
  'xpf',
]);

// Stripe's special-cased three-decimal currencies — *1000 instead of *100.
// https://docs.stripe.com/currencies#special-cased
const THREE_DECIMAL_CURRENCIES = new Set(['bhd', 'jod', 'kwd', 'omr', 'tnd']);

/**
 * Converts a decimal amount (e.g. an Order.total of 49.99) into the integer
 * unit Stripe's API expects for the given currency. Most currencies are
 * "2-decimal" (multiply by 100), but Stripe also has zero-decimal
 * currencies (e.g. VND, JPY, where the smallest unit already is the display
 * unit) and a handful of three-decimal currencies. Applying the wrong
 * multiplier silently over/under-charges by 10x or 100x — this only
 * happened to be correct before because the app's only currency to date is
 * the zero-decimal VND default.
 */
export function toStripeAmount(amount: number, currency: string): number {
  const normalized = currency.toLowerCase();
  // Big avoids float drift in the multiplication (e.g. 1.005 * 100 ===
  // 100.49999999999999 would otherwise round down a unit).
  return new Big(amount).times(minorUnitFactor(normalized)).round(0).toNumber();
}

/**
 * Inverse of `toStripeAmount` — converts an integer amount from a Stripe
 * object (e.g. a webhook `charge.amount`/`amount_refunded`) back into the
 * app's decimal amount, for comparing against or storing alongside
 * `Payment.amount`/`Refund.amount`.
 */
export function fromStripeAmount(units: number, currency: string): number {
  const normalized = currency.toLowerCase();
  return new Big(units).div(minorUnitFactor(normalized)).toNumber();
}

function minorUnitFactor(normalizedCurrency: string): number {
  if (ZERO_DECIMAL_CURRENCIES.has(normalizedCurrency)) return 1;
  if (THREE_DECIMAL_CURRENCIES.has(normalizedCurrency)) return 1000;
  return 100;
}
