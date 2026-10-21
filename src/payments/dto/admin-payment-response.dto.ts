import { Paginated } from '@/common/dto/pagination.dto';
import { PaymentResponseDto } from './payment-response.dto';

export class AdminPaymentResponseDto extends PaymentResponseDto {}

export class AdminPaymentPaginatedResponseDto extends Paginated(
  AdminPaymentResponseDto,
) {}
