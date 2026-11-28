import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateProductVariantDto {
  @ApiProperty({ example: 'Đỏ - L' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'PROD-001-RED-L' })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({ example: 299000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ example: 100, default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  stock?: number;

  @ApiPropertyOptional({ example: 350, description: 'Packed weight (g)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  weightGrams?: number;

  @ApiPropertyOptional({ example: 30, description: 'Packed length (cm)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  lengthCm?: number;

  @ApiPropertyOptional({ example: 20, description: 'Packed width (cm)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  widthCm?: number;

  @ApiPropertyOptional({ example: 5, description: 'Packed height (cm)' })
  @IsInt()
  @Min(1)
  @IsOptional()
  heightCm?: number;

  @ApiPropertyOptional({
    example: 10,
    description: 'Flag as low stock when available drops to this (null = off)',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  lowStockThreshold?: number;

  @ApiPropertyOptional({ example: { color: 'red', size: 'L' } })
  @IsObject()
  @IsOptional()
  attributes?: Record<string, unknown>;

  @ApiPropertyOptional({ example: true, default: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
