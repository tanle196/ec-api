import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import type { CurrentUser as ICurrentUser } from '@/common/interfaces/current-user.interface';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { UpdateReviewDto } from './dto/update-review.dto';
import { ReviewListQueryDto } from './dto/review-list-query.dto';
import {
  ReviewPaginatedResponseDto,
  ReviewResponseDto,
} from './dto/review-response.dto';

@ApiTags('reviews')
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a review for a product (one per product)' })
  @ApiResponse({ status: 201, type: ReviewResponseDto })
  create(
    @CurrentUser() user: ICurrentUser,
    @Body() dto: CreateReviewDto,
  ): Promise<ReviewResponseDto> {
    return this.reviewsService.create(user.id!, dto);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'List my own reviews' })
  @ApiOkResponse({ type: ReviewPaginatedResponseDto })
  findMyReviews(
    @CurrentUser() user: ICurrentUser,
    @Query() query: ReviewListQueryDto,
  ): Promise<ReviewPaginatedResponseDto> {
    return this.reviewsService.findMyReviews(user.id!, query);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update own review (resets approval)' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ type: ReviewResponseDto })
  update(
    @Param('id') id: string,
    @CurrentUser() user: ICurrentUser,
    @Body() dto: UpdateReviewDto,
  ): Promise<ReviewResponseDto> {
    const isAdmin = user.permissions.includes('review.update');
    return this.reviewsService.update(id, user.id!, dto, isAdmin);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete own review (admin can delete any)' })
  @ApiParam({ name: 'id', example: 'uuid-v4' })
  @ApiOkResponse({ schema: { example: { success: true } } })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: ICurrentUser,
  ): Promise<{ success: boolean }> {
    const isAdmin = user.permissions.includes('review.delete');
    return this.reviewsService.remove(id, user.id!, isAdmin);
  }
}

// ── Nested under products ──────────────────────────────────────

@ApiTags('products')
@Controller('products/:productId/reviews')
export class ProductReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Get()
  @ApiOperation({ summary: 'List approved reviews for a product' })
  @ApiParam({ name: 'productId', example: 'uuid-v4' })
  @ApiOkResponse({ type: ReviewPaginatedResponseDto })
  findApproved(
    @Param('productId') productId: string,
    @Query() query: ReviewListQueryDto,
  ): Promise<ReviewPaginatedResponseDto> {
    return this.reviewsService.findApproved(productId, query);
  }
}
