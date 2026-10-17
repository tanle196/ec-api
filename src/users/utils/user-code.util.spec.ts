import { generateUserCode } from './user-code.util';

describe('generateUserCode', () => {
  afterEach(() => jest.useRealTimers());

  it('formats as USR-YYYYMMDD-XXXXXX using the current UTC date', () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-17T12:00:00Z'));

    expect(generateUserCode()).toMatch(/^USR-20261017-[A-Z0-9]{6}$/);
  });

  it('generates different codes on successive calls', () => {
    const codes = new Set(Array.from({ length: 20 }, generateUserCode));

    expect(codes.size).toBeGreaterThan(1);
  });
});
