import { BadRequestException } from '@nestjs/common';

/**
 * Validates the optional Idempotency-Key header: 1-100 printable ASCII
 * characters (a client-generated UUID is typical). `@Headers()` takes no
 * pipes, so controllers call this directly.
 */
export function parseIdempotencyKey(
  value: string | undefined,
): string | undefined {
  if (value === undefined || value === '') return undefined;
  if (!/^[\x21-\x7e]{1,100}$/.test(value)) {
    throw new BadRequestException(
      'Idempotency-Key must be 1-100 printable ASCII characters',
    );
  }
  return value;
}
