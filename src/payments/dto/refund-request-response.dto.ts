import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { RefundRequestStatus } from '../enums/refund-request-status.enum';

export class RefundRequestItemResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() order_item_id!: string;
  @ApiProperty() quantity!: number;
  @ApiProperty() amount!: number;
}

export class RefundRequestResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() payment_id!: string;
  @ApiProperty() order_id!: string;
  @ApiProperty() requested_by!: string;
  @ApiProperty() amount!: number;
  @ApiProperty() reason!: string;
  @ApiProperty({ enum: RefundRequestStatus }) status!: RefundRequestStatus;
  @ApiPropertyOptional() adminNote!: string | null;
  @ApiPropertyOptional() reviewedBy!: string | null;
  @ApiPropertyOptional() reviewedAt!: Date | null;
  @ApiPropertyOptional() refund_id!: string | null;
  @ApiProperty({ type: [RefundRequestItemResponseDto] })
  items!: RefundRequestItemResponseDto[];
  @ApiProperty() createdAt!: Date;
}

export class RefundRequestPaginatedResponseDto extends PaginatedResponseDto<RefundRequestResponseDto> {
  @ApiProperty({ type: [RefundRequestResponseDto] })
  declare data: RefundRequestResponseDto[];
}
