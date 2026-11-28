import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, Min } from 'class-validator';

export class UpsertShippingRateDto {
  @ApiProperty({ example: 500 })
  @IsInt()
  @Min(1)
  baseWeightGrams!: number;

  @ApiProperty({ example: 22000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  baseFee!: number;

  @ApiProperty({ example: 500 })
  @IsInt()
  @Min(1)
  stepWeightGrams!: number;

  @ApiProperty({ example: 5000 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  stepFee!: number;
}
