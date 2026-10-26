import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from 'class-validator';

export class RefundItemInputDto {
  @ApiProperty({ example: 'uuid-v4', description: 'Order item ID to refund' })
  @IsUUID()
  order_item_id!: string;

  @ApiProperty({ example: 1, description: 'Quantity to refund' })
  @IsInt()
  @Min(1)
  quantity!: number;
}

export class CreateRefundDto {
  @ApiProperty({ type: [RefundItemInputDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => RefundItemInputDto)
  items!: RefundItemInputDto[];

  @ApiProperty({ example: 'Sản phẩm bị lỗi khi giao hàng' })
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
