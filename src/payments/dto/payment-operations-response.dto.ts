import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Paginated } from '@/common/dto/pagination.dto';
import { PaymentIssueStatus } from '../enums/payment-issue-status.enum';
import { PaymentIssueType } from '../enums/payment-issue-type.enum';
import { PaymentMethod } from '../enums/payment-method.enum';

export class PaymentIssueResponseDto {
  @ApiProperty() id!: string;
  @ApiProperty({ enum: PaymentIssueType }) type!: PaymentIssueType;
  @ApiProperty({ enum: PaymentIssueStatus }) status!: PaymentIssueStatus;
  @ApiPropertyOptional({ type: String, nullable: true })
  payment_id!: string | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  order_id!: string | null;
  @ApiPropertyOptional({ enum: PaymentMethod, nullable: true })
  method!: PaymentMethod | null;
  @ApiProperty() summary!: string;
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  details!: Record<string, unknown> | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  resolvedBy!: string | null;
  @ApiPropertyOptional({ type: Date, nullable: true })
  resolvedAt!: Date | null;
  @ApiPropertyOptional({ type: String, nullable: true })
  resolutionNote!: string | null;
  @ApiProperty() createdAt!: Date;
  @ApiProperty() updatedAt!: Date;
}

export class PaymentIssuePaginatedResponseDto extends Paginated(
  PaymentIssueResponseDto,
) {}

export class CodSettlementLineResultDto {
  @ApiProperty() orderNumber!: string;
  @ApiProperty({
    enum: [
      'settled',
      'already_settled',
      'amount_mismatch',
      'not_delivered',
      'no_cod_payment',
      'order_not_found',
    ],
  })
  result!: string;
  @ApiPropertyOptional() message?: string;
}

export class CodSettlementResponseDto {
  @ApiProperty() reference!: string;
  @ApiProperty() settled!: number;
  @ApiProperty({ description: 'Lines raised as payment issues or not found' })
  needsAttention!: number;
  @ApiProperty({ type: [CodSettlementLineResultDto] })
  lines!: CodSettlementLineResultDto[];
}

export class ReconciliationResponseDto {
  @ApiProperty({ description: 'False when a run was already in progress' })
  ran!: boolean;
  @ApiProperty() healed!: number;
  @ApiProperty() failed!: number;
  @ApiProperty() verified!: number;
  @ApiProperty() issues!: number;
  @ApiProperty() errors!: number;
}
