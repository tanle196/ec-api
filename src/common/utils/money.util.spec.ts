import Big from 'big.js';
import { MONEY_DECIMAL_PLACES, toMoney } from './money.util';

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
