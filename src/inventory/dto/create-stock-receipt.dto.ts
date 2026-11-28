import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class StockReceiptItemDto {
  @ApiProperty({ example: 'uuid-v4' })
  @IsUUID()
  variant_id!: string;

  @ApiProperty({ example: 50 })
  @IsInt()
  @Min(1)
  quantity!: number;

  @ApiProperty({ example: 85000, description: 'Purchase cost per unit' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost!: number;
}

export class CreateStockReceiptDto {
  @ApiPropertyOptional({ example: 'Công ty May Việt' })
  @IsString()
  @MaxLength(255)
  @IsOptional()
  supplier?: string;

  @ApiPropertyOptional({ example: 'Đợt hàng tháng 12' })
  @IsString()
  @IsOptional()
  note?: string;

  @ApiProperty({ type: [StockReceiptItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => StockReceiptItemDto)
  items!: StockReceiptItemDto[];
}
