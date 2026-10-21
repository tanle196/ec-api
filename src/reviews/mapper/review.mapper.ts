import { User } from '@/users/entities/user.entity';
import { ReviewAuthorDto, ReviewResponseDto } from '../dto/review-response.dto';
import { Review } from '../entities/review.entity';

export class ReviewMapper {
  // Only public profile fields — never email or other account data, since
  // reviews are listed on unauthenticated product pages.
  static toAuthor = (user: User): ReviewAuthorDto => ({
    id: user.id,
    fullName: user.fullName ?? null,
    avatar: user.avatar ?? null,
  });

  static toResponse = (entity: Review): ReviewResponseDto => ({
    id: entity.id,
    user_id: entity.user_id,
    user: entity.user ? ReviewMapper.toAuthor(entity.user) : null,
    product_id: entity.product_id,
    rating: entity.rating,
    title: entity.title,
    content: entity.content,
    isVerified: entity.isVerified,
    isApproved: entity.isApproved,
    createdAt: entity.createdAt,
    updatedAt: entity.updatedAt,
  });

  static toResponseList = (entities: Review[]): ReviewResponseDto[] =>
    entities.map(ReviewMapper.toResponse);
}
