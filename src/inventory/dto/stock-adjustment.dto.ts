import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
} from 'class-validator';

export class StockAdjustmentDto {
  @ApiProperty({ example: 'uuid-v4' })
  @IsUUID()
  variant_id!: string;

  @ApiPropertyOptional({
    example: 42,
    description:
      'Counted quantity physically on hand (stocktake). Give this or delta.',
  })
  @IsInt()
  @Min(0)
  @IsOptional()
  onHand?: number;

  @ApiPropertyOptional({
    example: -2,
    description: 'Change to on-hand stock, e.g. -2 for damaged units.',
  })
  @IsInt()
  @IsOptional()
  delta?: number;

  @ApiProperty({ example: 'Kiểm kê cuối tháng: lệch 2 cái' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  note!: string;
}
