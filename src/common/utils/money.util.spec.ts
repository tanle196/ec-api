import Big from 'big.js';
import {
  formatMoney,
  MONEY_DECIMAL_PLACES,
  moneyTransformer,
  toMoney,
} from './money.util';

describe('toMoney', () => {
  it('uses 2 decimal places', () => {
    expect(MONEY_DECIMAL_PLACES).toBe(2);
  });

  it('rounds a plain number to 2 decimal places', () => {
    expect(toMoney(10.005)).toBe(10.01);
    expect(toMoney(10.004)).toBe(10);
  });

  it('accepts numeric strings', () => {
    expect(toMoney('99.999')).toBe(100);
  });

  it('finishes a Big.js chain without floating point drift', () => {
    expect(toMoney(new Big(0.1).plus(0.2))).toBe(0.3);
  });

  it('returns a number type', () => {
    expect(typeof toMoney('1.5')).toBe('number');
  });

  it('throws on non-numeric input', () => {
    expect(() => toMoney('abc')).toThrow();
  });
});

describe('formatMoney', () => {
  it('formats 2-decimal currencies with 2 decimals', () => {
    expect(formatMoney(10.5, 'usd')).toBe('$10.50');
  });

  it('formats VND without decimals using the vi-VN locale', () => {
    expect(formatMoney(150000, 'vnd')).toBe('150.000\u00a0₫');
  });

  it('rounds half-up before formatting', () => {
    expect(formatMoney('1.005', 'usd')).toBe('$1.01');
  });

  it('accepts a Big instance', () => {
    expect(formatMoney(new Big(0.1).plus(0.2), 'usd')).toBe('$0.30');
  });
});

describe('moneyTransformer', () => {
  it('converts decimal strings from the database into numbers', () => {
    expect(moneyTransformer.from('49.99')).toBe(49.99);
  });

  it('passes nulls through', () => {
    expect(moneyTransformer.from(null)).toBeNull();
  });

  it('writes values unchanged', () => {
    expect(moneyTransformer.to(10)).toBe(10);
  });
});
