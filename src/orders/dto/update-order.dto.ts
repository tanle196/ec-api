import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { CreateOrderItemDto } from './create-order.dto';

export class UpdateOrderDto {
  @ApiPropertyOptional({
    example: 'uuid-v4',
    description: 'Delivery address ID',
  })
  @IsUUID()
  @IsOptional()
  address_id?: string;

  @ApiPropertyOptional({
    type: [CreateOrderItemDto],
    description: 'Replaces the entire item list',
  })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  @IsOptional()
  items?: CreateOrderItemDto[];

  @ApiPropertyOptional({ example: 'Giao giờ hành chính' })
  @IsString()
  @IsOptional()
  notes?: string;
}
