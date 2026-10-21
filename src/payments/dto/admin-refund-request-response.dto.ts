import { ApiPropertyOptional } from '@nestjs/swagger';
import { Paginated } from '@/common/dto/pagination.dto';
import { RefundRequestResponseDto } from './refund-request-response.dto';

export class AdminRefundRequestResponseDto extends RefundRequestResponseDto {
  @ApiPropertyOptional() reviewedBy!: string | null;
}

export class AdminRefundRequestPaginatedResponseDto extends Paginated(
  AdminRefundRequestResponseDto,
) {}
