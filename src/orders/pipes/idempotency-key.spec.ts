import { BadRequestException } from '@nestjs/common';
import { parseIdempotencyKey } from './idempotency-key';

describe('parseIdempotencyKey', () => {
  it('accepts a client key and treats an empty header as none', () => {
    expect(parseIdempotencyKey('8f14e45f-ceea-467a-9575-7a2b1c3d4e5f')).toBe(
      '8f14e45f-ceea-467a-9575-7a2b1c3d4e5f',
    );
    expect(parseIdempotencyKey(undefined)).toBeUndefined();
    expect(parseIdempotencyKey('')).toBeUndefined();
  });

  it.each(['a'.repeat(101), 'has space', 'không'])('rejects %j', (key) => {
    expect(() => parseIdempotencyKey(key)).toThrow(BadRequestException);
  });
});
