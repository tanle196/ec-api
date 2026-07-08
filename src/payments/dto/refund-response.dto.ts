import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { RefundStatus } from '../enums/refund-status.enum';

export class RefundItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() order_item_id!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() amount!: number;
}

export class RefundResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() payment_id!: string;
  @ApiProperty() order_id!: string;
  @ApiProperty() amount!: number;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: RefundStatus }) status!: RefundStatus;
  @ApiPropertyOptional() transactionId!: string | null;
  @ApiPropertyOptional() actorId!: string | null;
  @ApiProperty({ type: [RefundItemResponseDto] })
  items!: RefundItemResponseDto[];
  @ApiProperty() createdAt!: Date;
}
