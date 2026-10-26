import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';
import { RefundItemInputDto } from './create-refund.dto';

export class CreateRefundRequestDto {
  @ApiProperty({ example: 'uuid-v4', description: 'Payment ID to refund' })
  @IsUUID()
  payment_id!: string;

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
