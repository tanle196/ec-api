import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class ValidateDiscountItemDto {
  @ApiProperty({ example: 'uuid-v4', description: 'Product variant ID' })
  @IsUUID()
  variant_id!: string;

  @ApiProperty({ example: 2 })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class ValidateDiscountDto {
  @ApiProperty({ example: 'SALE20' })
  @IsString()
  @IsNotEmpty()
  code!: string;

  @ApiPropertyOptional({
    type: [ValidateDiscountItemDto],
    description:
      'Items to price the code against. Required for codes scoped to products/categories; when given, the subtotal is computed from current prices and `subtotal` is ignored.',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ValidateDiscountItemDto)
  @IsOptional()
  items?: ValidateDiscountItemDto[];

  @ApiPropertyOptional({
    example: 500000,
    description:
      'Order subtotal to calculate discount against. Required when `items` is omitted.',
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  subtotal?: number;
}
