import { Paginated } from '@/common/dto/pagination.dto';
import { DiscountResponseDto } from './discount-response.dto';

export class AdminDiscountResponseDto extends DiscountResponseDto {}

export class AdminDiscountPaginatedResponseDto extends Paginated(
  AdminDiscountResponseDto,
) {}
