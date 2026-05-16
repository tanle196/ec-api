import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDate,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { DiscountType } from '../enums/discount-type.enum';

export class CreateDiscountDto {
  @ApiProperty({ example: 'SALE20' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  code!: string;

  @ApiProperty({ enum: DiscountType, example: DiscountType.PERCENT })
  @IsEnum(DiscountType)
  type!: DiscountType;

  @ApiProperty({ example: 20, description: 'Percent (0–100) or fixed amount in VND' })
  @IsNumber()
  @IsPositive()
  value!: number;

  @ApiPropertyOptional({ example: 100000, description: 'Minimum subtotal to apply' })
  @IsNumber()
  @Min(0)
  @IsOptional()
  minOrderValue?: number;

  @ApiPropertyOptional({ example: 100, description: 'Max total usages (null = unlimited)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  usageLimit?: number;

  @ApiPropertyOptional({ example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @ApiPropertyOptional({ example: '2026-01-01T00:00:00Z' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  startsAt?: Date;

  @ApiPropertyOptional({ example: '2026-12-31T23:59:59Z' })
  @Type(() => Date)
  @IsDate()
  @IsOptional()
  expiresAt?: Date;
}
