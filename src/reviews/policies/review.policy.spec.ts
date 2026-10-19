import { ForbiddenException } from '@nestjs/common';
import { ReviewPolicy } from './review.policy';

describe('ReviewPolicy', () => {
  const policy = new ReviewPolicy();
  const review = { user_id: 'user-1' };

  it.each([
    ['assertCanEdit', 'You can only edit your own reviews'],
    ['assertCanDelete', 'You can only delete your own reviews'],
  ] as const)('%s allows the author or an admin only', (method, message) => {
    expect(() => policy[method](review, 'user-1', false)).not.toThrow();
    expect(() => policy[method](review, 'admin-1', true)).not.toThrow();
    expect(() => policy[method](review, 'user-2', false)).toThrow(
      new ForbiddenException(message),
    );
  });
});
