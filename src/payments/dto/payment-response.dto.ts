import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Paginated } from '@/common/dto/pagination.dto';
import { PaymentMethod } from '../enums/payment-method.enum';
import { PaymentStatus } from '../enums/payment-status.enum';

export class PaymentBaseResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty() order_id!: string;
  @ApiProperty({ enum: PaymentMethod }) method!: PaymentMethod;
  @ApiProperty({ enum: PaymentStatus }) status!: PaymentStatus;
  @ApiProperty() amount!: number;
  @ApiPropertyOptional() transactionId!: string | null;
  @ApiPropertyOptional() paidAt!: Date | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

// Customer-facing view of the stored gateway metadata. The raw column holds
// the full provider payload (e.g. a Stripe Checkout Session), which is not
// meant for the client — only the redirect URL is.
export class PaymentMetadataDto {
  @ApiPropertyOptional({ nullable: true }) checkoutUrl!: string | null;
}

export class PaymentResponseDto extends PaymentBaseResponseDto {
  @ApiPropertyOptional({ type: PaymentMetadataDto, nullable: true })
  metadata!: PaymentMetadataDto | null;
}

export class PaymentPaginatedResponseDto extends Paginated(
  PaymentResponseDto,
) {}
