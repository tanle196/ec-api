import { ReviewMapper } from './review.mapper';

describe('ReviewMapper', () => {
  const createdAt = new Date('2026-01-01');
  const review = {
    id: 'review-1',
    user_id: 'user-1',
    user: {
      id: 'user-1',
      email: 'customer@example.com',
      userCode: 'USR-1',
      fullName: 'Nguyễn Văn A',
      avatar: 'https://cdn/a.png',
      identities: [{ passwordHash: 'hash' }],
    },
    product_id: 'product-1',
    product: { id: 'product-1' },
    rating: 5,
    title: 'Good',
    content: 'Nice',
    isVerified: true,
    isApproved: true,
    createdAt,
    updatedAt: createdAt,
  };

  it('exposes only the public author profile', () => {
    expect(ReviewMapper.toResponse(review as never)).toEqual({
      id: 'review-1',
      user_id: 'user-1',
      user: {
        id: 'user-1',
        fullName: 'Nguyễn Văn A',
        avatar: 'https://cdn/a.png',
      },
      product_id: 'product-1',
      rating: 5,
      title: 'Good',
      content: 'Nice',
      isVerified: true,
      isApproved: true,
      createdAt,
      updatedAt: createdAt,
    });
  });

  it('returns a null author when the relation was not loaded', () => {
    expect(
      ReviewMapper.toResponse({ ...review, user: undefined } as never).user,
    ).toBeNull();
  });
});
