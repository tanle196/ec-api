import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { PaymentResponseDto } from './payment-response.dto';

export class AdminPaymentResponseDto extends PaymentResponseDto {}

export class AdminPaymentPaginatedResponseDto extends PaginatedResponseDto<AdminPaymentResponseDto> {
  @ApiProperty({ type: [AdminPaymentResponseDto] })
  declare data: AdminPaymentResponseDto[];
}
