import { ApiProperty } from '@nestjs/swagger';
import { PaginatedResponseDto } from '@/common/dto/pagination.dto';
import { ReviewResponseDto } from './review-response.dto';

export class AdminReviewResponseDto extends ReviewResponseDto {}

export class AdminReviewPaginatedResponseDto extends PaginatedResponseDto<AdminReviewResponseDto> {
  @ApiProperty({ type: [AdminReviewResponseDto] })
  declare data: AdminReviewResponseDto[];
}
