// common/errors/error-mapper.ts
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';

interface PostgresError extends QueryFailedError {
  code: string;
  detail?: string;
}

export class ErrorMapper {
  static map(error: unknown): Error {
    if (error instanceof QueryFailedError) {
      const dbError = error as PostgresError;

      switch (dbError.code) {
        case '23505': // unique_violation
          return new ConflictException('Duplicate entry');
        case '23503': // foreign_key_violation
          return new BadRequestException('Invalid reference');
        case '23502': // not_null_violation
          return new BadRequestException('Missing required field');
        case '42501': // insufficient_privilege
          return new ForbiddenException('Permission denied');
        default:
          return new InternalServerErrorException('Database error');
      }
    }

    if (error instanceof Error) {
      return error;
    }

    // Unknown
    return new InternalServerErrorException('Unexpected error');
  }
}

interface ErrorMeta {
  [key: string]: any;
}

export function logError(
  error: unknown,
  context: string,
  meta?: ErrorMeta,
) {
  // chuẩn hóa error
  let errorCode: string | undefined;
  let stack: string | undefined;

  if (error instanceof Error) {
    stack = error.stack;
  }

  if (error instanceof QueryFailedError) {
    // QueryFailedError hoặc custom error
    const dbError = error as PostgresError;
    errorCode = dbError.code;
  }
}
