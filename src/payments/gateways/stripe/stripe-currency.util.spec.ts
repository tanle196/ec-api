import { fromStripeAmount, toStripeAmount } from './stripe-currency.util';

describe('stripe-currency.util', () => {
  describe('toStripeAmount', () => {
    it('does not multiply zero-decimal currencies', () => {
      expect(toStripeAmount(150000, 'vnd')).toBe(150000);
      expect(toStripeAmount(1000.4, 'JPY')).toBe(1000);
    });

    it('multiplies two-decimal currencies by 100 and rounds', () => {
      expect(toStripeAmount(49.99, 'usd')).toBe(4999);
      expect(toStripeAmount(0.1 + 0.2, 'EUR')).toBe(30);
    });

    it('rounds half-up without float drift', () => {
      // 1.005 * 100 === 100.49999999999999 in plain float math
      expect(toStripeAmount(1.005, 'usd')).toBe(101);
    });

    it('multiplies three-decimal currencies by 1000', () => {
      expect(toStripeAmount(1.234, 'kwd')).toBe(1234);
    });
  });

  describe('fromStripeAmount', () => {
    it('reverses each currency class', () => {
      expect(fromStripeAmount(150000, 'VND')).toBe(150000);
      expect(fromStripeAmount(4999, 'usd')).toBe(49.99);
      expect(fromStripeAmount(1234, 'BHD')).toBe(1.234);
    });

    it('round-trips with toStripeAmount', () => {
      for (const currency of ['vnd', 'usd', 'kwd']) {
        expect(fromStripeAmount(toStripeAmount(12, currency), currency)).toBe(
          12,
        );
      }
    });
  });
});
