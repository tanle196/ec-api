import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminReviewsController } from './admin-reviews.controller';
import {
  ProductReviewsController,
  ReviewsController,
} from './reviews.controller';

const handler = (cls: { prototype: object }, method: string) =>
  Object.getOwnPropertyDescriptor(cls.prototype, method)?.value as object;

describe('Review controllers', () => {
  const service = {
    create: jest.fn().mockResolvedValue('create'),
    findMyReviews: jest.fn().mockResolvedValue('findMyReviews'),
    update: jest.fn().mockResolvedValue('update'),
    remove: jest.fn().mockResolvedValue('remove'),
    findApproved: jest.fn().mockResolvedValue('findApproved'),
    findAll: jest.fn().mockResolvedValue('findAll'),
    approve: jest.fn().mockResolvedValue('approve'),
  };

  beforeEach(() => jest.clearAllMocks());

  describe('ReviewsController', () => {
    const controller = new ReviewsController(service as never);
    const customer = { id: 'user-1', permissions: [] } as never;

    it.each(['create', 'findMyReviews', 'update', 'remove'])(
      '%s requires JwtAuthGuard',
      (method) => {
        expect(
          Reflect.getMetadata(
            GUARDS_METADATA,
            handler(ReviewsController, method),
          ),
        ).toEqual([JwtAuthGuard]);
      },
    );

    it('create and findMyReviews use the current user', async () => {
      await controller.create(customer, {
        product_id: 'p',
        rating: 5,
      });
      await controller.findMyReviews(customer, { page: 1 });

      expect(service.create).toHaveBeenCalledWith('user-1', {
        product_id: 'p',
        rating: 5,
      });
      expect(service.findMyReviews).toHaveBeenCalledWith('user-1', { page: 1 });
    });

    it.each([
      [[], false],
      [['review.update'], true],
    ])(
      'update with permissions %p passes isAdmin=%p',
      async (perms, isAdmin) => {
        await controller.update(
          'review-1',
          { id: 'user-1', permissions: perms } as never,
          { rating: 3 },
        );

        expect(service.update).toHaveBeenCalledWith(
          'review-1',
          'user-1',
          { rating: 3 },
          isAdmin,
        );
      },
    );

    it.each([
      [[], false],
      [['review.update'], false],
      [['review.delete'], true],
    ])(
      'remove with permissions %p passes isAdmin=%p',
      async (perms, isAdmin) => {
        await controller.remove('review-1', {
          id: 'user-1',
          permissions: perms,
        } as never);

        expect(service.remove).toHaveBeenCalledWith(
          'review-1',
          'user-1',
          isAdmin,
        );
      },
    );
  });

  it('ProductReviewsController lists approved reviews publicly', async () => {
    const controller = new ProductReviewsController(service as never);

    expect(
      Reflect.getMetadata(
        GUARDS_METADATA,
        handler(ProductReviewsController, 'findApproved'),
      ),
    ).toBeUndefined();
    await expect(controller.findApproved('p', { page: 1 })).resolves.toBe(
      'findApproved',
    );
    expect(service.findApproved).toHaveBeenCalledWith('p', { page: 1 });
  });

  describe('AdminReviewsController', () => {
    const controller = new AdminReviewsController(service as never);

    it('is protected by JwtAuthGuard and PermissionsGuard', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, AdminReviewsController),
      ).toEqual([JwtAuthGuard, PermissionsGuard]);
    });

    it('findAll requires review.read', async () => {
      expect(
        Reflect.getMetadata(
          'permissions',
          handler(AdminReviewsController, 'findAll'),
        ),
      ).toEqual(['review.read']);
      await expect(controller.findAll({ page: 1 })).resolves.toBe('findAll');
    });

    it('approve requires review.update', async () => {
      expect(
        Reflect.getMetadata(
          'permissions',
          handler(AdminReviewsController, 'approve'),
        ),
      ).toEqual(['review.update']);
      await controller.approve('review-1', false);
      expect(service.approve).toHaveBeenCalledWith('review-1', false);
    });
  });
});
