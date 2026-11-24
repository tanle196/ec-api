import { ApiPropertyOptional } from '@nestjs/swagger';
import { Paginated } from '@/common/dto/pagination.dto';
import { PaymentBaseResponseDto } from './payment-response.dto';

export class AdminPaymentResponseDto extends PaymentBaseResponseDto {
  @ApiPropertyOptional({
    type: 'object',
    additionalProperties: true,
    nullable: true,
  })
  metadata!: Record<string, unknown> | null;
}

export class AdminPaymentPaginatedResponseDto extends Paginated(
  AdminPaymentResponseDto,
) {}
