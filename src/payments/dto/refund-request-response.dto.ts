import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Paginated } from '@/common/dto/pagination.dto';
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
  @ApiPropertyOptional({ type: String, nullable: true })
  adminNote!: string | null;
  @ApiPropertyOptional({ type: Date, nullable: true })
  reviewedAt!: Date | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  refund_id!: string | null;
  @ApiProperty({ type: [RefundRequestItemResponseDto] })
  items!: RefundRequestItemResponseDto[];
  @ApiProperty() createdAt!: Date;
}

export class RefundRequestPaginatedResponseDto extends Paginated(
  RefundRequestResponseDto,
) {}
