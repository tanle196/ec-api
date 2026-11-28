import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class CodSettlementLineDto {
  @ApiProperty({ example: 'ORD-20261128-ABC123' })
  @IsString()
  @IsNotEmpty()
  orderNumber!: string;

  @ApiProperty({ example: 350000, description: 'Amount the carrier remitted' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  amount!: number;
}

export class CodSettlementDto {
  @ApiPropertyOptional({ example: 'GHN' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  carrier?: string;

  @ApiProperty({
    example: 'GHN-DS-2026-11-28',
    description: "Carrier's settlement / statement reference",
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reference!: string;

  @ApiProperty({ type: [CodSettlementLineDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(1000)
  @ValidateNested({ each: true })
  @Type(() => CodSettlementLineDto)
  lines!: CodSettlementLineDto[];
}
