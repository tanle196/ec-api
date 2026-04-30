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
        case '23505':
          return new ConflictException('Duplicate entry');
        case '23503':
          return new BadRequestException('Invalid reference');
        case '23502':
          return new BadRequestException('Missing required field');
        case '42501':
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
