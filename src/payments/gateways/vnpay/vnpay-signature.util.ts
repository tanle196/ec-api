import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * VNPay (API v2.1.0) signing.
 *
 * Payment URL and IPN/return query strings are signed over the parameters
 * sorted by key, each value encoded the way VNPay's reference code does it
 * (encodeURIComponent with spaces as "+"), joined as k=v&k=v, with
 * HMAC-SHA512 over that string. The same encoded string is what goes on
 * the URL, so the signature covers exactly what VNPay receives.
 *
 * The merchant API (refund, querydr) instead signs a fixed list of fields
 * joined with "|", see `signPipe`.
 */

const encode = (value: string) =>
  encodeURIComponent(value).replace(/%20/g, '+');

export function canonicalQuery(params: Record<string, string>): string {
  return Object.keys(params)
    .filter((k) => params[k] !== undefined && params[k] !== '')
    .sort()
    .map((k) => `${encode(k)}=${encode(params[k])}`)
    .join('&');
}

export function hmacSha512(secret: string, data: string): string {
  return createHmac('sha512', secret).update(data, 'utf8').digest('hex');
}

/** Builds the full signed query string for a payment URL. */
export function signQuery(
  params: Record<string, string>,
  secret: string,
): string {
  const query = canonicalQuery(params);
  return `${query}&vnp_SecureHash=${hmacSha512(secret, query)}`;
}

/**
 * Verifies a signed callback (IPN or return URL). `params` is the decoded
 * query as the HTTP framework parsed it; the hash fields are excluded from
 * what is signed.
 */
export function verifyQuery(
  params: Record<string, string>,
  secret: string,
): boolean {
  const received = params.vnp_SecureHash;
  if (!received) return false;

  const signed: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    if (key === 'vnp_SecureHash' || key === 'vnp_SecureHashType') continue;
    if (!key.startsWith('vnp_')) continue;
    signed[key] = value;
  }
  return safeEqualHex(hmacSha512(secret, canonicalQuery(signed)), received);
}

/** Merchant API signature: values joined with "|" in the documented order. */
export function signPipe(values: string[], secret: string): string {
  return hmacSha512(secret, values.join('|'));
}

export function safeEqualHex(expected: string, received: string): boolean {
  const a = Buffer.from(expected.toLowerCase(), 'utf8');
  const b = Buffer.from(received.toLowerCase(), 'utf8');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** yyyyMMddHHmmss in Vietnam time (UTC+7, no DST), as VNPay expects. */
export function vnpayDate(date: Date): string {
  const vn = new Date(date.getTime() + 7 * 60 * 60_000);
  const pad = (n: number) => String(n).padStart(2, '0');
  return (
    `${vn.getUTCFullYear()}${pad(vn.getUTCMonth() + 1)}${pad(vn.getUTCDate())}` +
    `${pad(vn.getUTCHours())}${pad(vn.getUTCMinutes())}${pad(vn.getUTCSeconds())}`
  );
}

/**
 * vnp_TxnRef must be unique per merchant; the payment id is, with its
 * dashes dropped to keep the reference alphanumeric.
 */
export const toTxnRef = (paymentId: string) => paymentId.replace(/-/g, '');

export function fromTxnRef(txnRef: string): string | null {
  if (!/^[0-9a-f]{32}$/i.test(txnRef)) return null;
  const h = txnRef.toLowerCase();
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** VNPay amounts are VND × 100, as an integer string. */
export const toVnpayAmount = (amount: number) =>
  String(Math.round(amount * 100));

export const fromVnpayAmount = (raw: string | undefined) =>
  raw === undefined || raw === '' ? NaN : Number(raw) / 100;
