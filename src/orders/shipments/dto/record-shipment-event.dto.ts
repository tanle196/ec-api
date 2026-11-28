import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDate,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ShipmentStatus } from '../enums/shipment-status.enum';

export class RecordShipmentEventDto {
  @ApiProperty({ enum: ShipmentStatus })
  @IsEnum(ShipmentStatus)
  status!: ShipmentStatus;

  @ApiPropertyOptional({ example: 'Khách không nghe máy' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'When it happened (default: now)' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  occurredAt?: Date;
}
