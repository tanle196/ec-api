import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';

export class PaymentResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() order_id!: string;
  @ApiProperty({ enum: PaymentMethod }) method!: PaymentMethod;
  @ApiProperty({ enum: PaymentStatus }) status!: PaymentStatus;
  @ApiProperty() amount!: number;
  @ApiPropertyOptional() transactionId!: string | null;
  @ApiPropertyOptional() metadata!: Record<string, unknown> | null;
  @ApiPropertyOptional() paidAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PaymentPaginatedResponseDto extends PaginatedResponseDto<PaymentResponseDto> {
  @ApiProperty({ type: [PaymentResponseDto] })
  declare data: PaymentResponseDto[];
}
