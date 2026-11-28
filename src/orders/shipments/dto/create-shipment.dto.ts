import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateShipmentDto {
  @ApiProperty({ example: 'GHN', description: 'Carrier, or "manual"' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  carrier!: string;

  @ApiPropertyOptional({ example: 'GHN123456789' })
  @IsString()
  @MaxLength(100)
  @IsOptional()
  trackingNumber?: string;

  @ApiPropertyOptional({ example: 'Giao trước 17h' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  note?: string;
}
