import { Paginated } from '@/common/dto/pagination.dto';
import { ReviewResponseDto } from './review-response.dto';

export class AdminReviewResponseDto extends ReviewResponseDto {}

export class AdminReviewPaginatedResponseDto extends Paginated(
  AdminReviewResponseDto,
) {}
