import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { ErrorMapper } from './error-mapper';
import { PostgresErrorCode } from './postgres-error-codes';

describe('ErrorMapper', () => {
  const dbError = (code: string) =>
    Object.assign(new QueryFailedError('SELECT 1', [], new Error('db')), {
      code,
    });

  it.each([
    [PostgresErrorCode.UniqueViolation, ConflictException],
    [PostgresErrorCode.ForeignKeyViolation, BadRequestException],
    [PostgresErrorCode.NotNullViolation, BadRequestException],
    [PostgresErrorCode.CheckViolation, ForbiddenException],
    ['99999', InternalServerErrorException],
  ])('maps Postgres code %s to %p', (code, expected) => {
    expect(ErrorMapper.map(dbError(code))).toBeInstanceOf(expected);
  });

  it('passes through non-database errors unchanged', () => {
    const error = new NotFoundException();

    expect(ErrorMapper.map(error)).toBe(error);
  });

  it('wraps non-Error values in InternalServerErrorException', () => {
    expect(ErrorMapper.map('boom')).toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
