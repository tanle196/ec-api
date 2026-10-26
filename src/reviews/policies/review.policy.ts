import { ForbiddenException, Injectable } from '@nestjs/common';
import { Review } from '../entities/review.entity';

// Business rules for reviews. Lookups, the one-review-per-product check and
// not-found checks stay in ReviewsService.
@Injectable()
export class ReviewPolicy {
  assertCanEdit(
    review: Pick<Review, 'user_id'>,
    userId: string,
    isAdmin: boolean,
  ): void {
    if (!isAdmin && review.user_id !== userId)
      throw new ForbiddenException('You can only edit your own reviews');
  }

  assertCanDelete(
    review: Pick<Review, 'user_id'>,
    userId: string,
    isAdmin: boolean,
  ): void {
    if (!isAdmin && review.user_id !== userId)
      throw new ForbiddenException('You can only delete your own reviews');
  }
}
