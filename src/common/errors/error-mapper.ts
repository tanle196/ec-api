import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { PostgresErrorCode } from './postgres-error-codes';

interface PostgresError extends QueryFailedError {
  code: string;
  detail?: string;
}

export class ErrorMapper {
  static map(error: unknown): Error {
    if (error instanceof QueryFailedError) {
      const dbError = error as PostgresError;

      switch (dbError.code) {
        case PostgresErrorCode.UniqueViolation:
          return new ConflictException('Duplicate entry');
        case PostgresErrorCode.ForeignKeyViolation:
          return new BadRequestException('Invalid reference');
        case PostgresErrorCode.NotNullViolation:
          return new BadRequestException('Missing required field');
        case PostgresErrorCode.CheckViolation:
          return new ForbiddenException('Permission denied');
        default:
          return new InternalServerErrorException('Database error');
      }
    }

    if (error instanceof Error) {
      return error;
    }

    return new InternalServerErrorException('Unexpected error');
  }
}
