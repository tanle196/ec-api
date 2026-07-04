import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { Permissions } from '@/permissions/decorators/permissions.decorator';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { ReviewsService } from './reviews.service';
import { ReviewListQueryDto } from './dto/review-list-query.dto';
import {
  AdminReviewPaginatedResponseDto,
  AdminReviewResponseDto,
} from './dto/admin-review-response.dto';

@ApiTags('Admin: reviews')
@Controller('admin/reviews')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('access-token')
export class AdminReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @Permissions('review.read')
  @ApiOperation({ summary: 'List all reviews with filters' })
  @ApiOkResponse({ type: AdminReviewPaginatedResponseDto })
  findAll(
    @Query() query: ReviewListQueryDto,
  ): Promise<AdminReviewPaginatedResponseDto> {
    return this.reviewsService.findAll(query);
  }

  @Patch(':id/approve')
  @Permissions('review.update')
  @ApiOperation({ summary: 'Approve or reject a review' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: AdminReviewResponseDto })
  approve(
    @Param('id') id: string,
    @Body('approved') approved: boolean,
  ): Promise<AdminReviewResponseDto> {
    return this.reviewsService.approve(id, approved);
  }
}
