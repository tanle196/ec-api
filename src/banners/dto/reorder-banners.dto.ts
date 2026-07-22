import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class BannerOrderItemDto {
  @ApiProperty({ example: 'uuid-v4' })
  @IsUUID()
  id!: string;

  @ApiProperty({ example: 0 })
  @IsInt()
  @Min(0)
  sortOrder!: number;
}

export class ReorderBannersDto {
  @ApiProperty({ type: [BannerOrderItemDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => BannerOrderItemDto)
  items!: BannerOrderItemDto[];
}
