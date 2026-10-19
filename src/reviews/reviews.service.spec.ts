import { ReviewPolicy } from './policies/review.policy';
import {
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { OrderStatus } from '@/orders/enums/order-status.enum';
import { ReviewsService } from './reviews.service';

describe('ReviewsService', () => {
  const review = {
    id: 'review-1',
    user_id: 'user-1',
    product_id: 'product-1',
    rating: 4,
    title: 'Good',
    content: 'Nice',
    isVerified: false,
    isApproved: true,
  };

  const buildService = () => {
    const reviewQb = {
      leftJoinAndSelect: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[review], 1]),
    };
    const reviewRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((d: object) => ({ ...d })),
      save: jest.fn((d: object) => Promise.resolve(d)),
      remove: jest.fn().mockResolvedValue(undefined),
      createQueryBuilder: jest.fn().mockReturnValue(reviewQb),
    };
    const productRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'product-1' }),
    };
    const orderQb = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(0),
    };
    const orderRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(orderQb),
    };
    const service = new ReviewsService(
      reviewRepo as never,
      productRepo as never,
      orderRepo as never,
      new ReviewPolicy(),
    );
    return { service, reviewRepo, reviewQb, productRepo, orderQb };
  };

  describe('create', () => {
    const dto = { product_id: 'product-1', rating: 5 };

    it('creates an unapproved, unverified review when the user has no delivered order', async () => {
      const { service, reviewRepo } = buildService();

      const result = await service.create('user-1', dto);

      expect(result).toEqual({
        user_id: 'user-1',
        product_id: 'product-1',
        rating: 5,
        title: null,
        content: null,
        isVerified: false,
        isApproved: false,
      });
      expect(reviewRepo.save).toHaveBeenCalled();
    });

    it('marks the review verified when the user has a delivered order with the product', async () => {
      const { service, orderQb } = buildService();
      orderQb.getCount.mockResolvedValue(1);

      const result = await service.create('user-1', dto);

      expect(result.isVerified).toBe(true);
      expect(orderQb.where).toHaveBeenCalledWith('o.user_id = :userId', {
        userId: 'user-1',
      });
      expect(orderQb.andWhere).toHaveBeenCalledWith('o.status = :status', {
        status: OrderStatus.DELIVERED,
      });
      expect(orderQb.andWhere).toHaveBeenCalledWith(
        'v.product_id = :productId',
        { productId: 'product-1' },
      );
    });

    it('rejects an unknown product', async () => {
      const { service, productRepo } = buildService();
      productRepo.findOne.mockResolvedValue(null);

      await expect(service.create('user-1', dto as never)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('allows only one review per product per user', async () => {
      const { service, reviewRepo } = buildService();
      reviewRepo.findOne.mockResolvedValue(review);

      await expect(service.create('user-1', dto as never)).rejects.toThrow(
        ConflictException,
      );
      expect(reviewRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('applies every provided filter and paginates', async () => {
      const { service, reviewQb } = buildService();

      const result = await service.findAll({
        page: 2,
        limit: 10,
        product_id: 'p',
        user_id: 'u',
        rating: 5,
        isApproved: false,
        isVerified: true,
      });

      expect(reviewQb.andWhere).toHaveBeenCalledWith(
        'r.product_id = :product_id',
        { product_id: 'p' },
      );
      expect(reviewQb.andWhere).toHaveBeenCalledWith('r.user_id = :user_id', {
        user_id: 'u',
      });
      expect(reviewQb.andWhere).toHaveBeenCalledWith('r.rating = :rating', {
        rating: 5,
      });
      expect(reviewQb.andWhere).toHaveBeenCalledWith(
        'r.isApproved = :isApproved',
        { isApproved: false },
      );
      expect(reviewQb.andWhere).toHaveBeenCalledWith(
        'r.isVerified = :isVerified',
        { isVerified: true },
      );
      expect(reviewQb.skip).toHaveBeenCalledWith(10);
      expect(reviewQb.take).toHaveBeenCalledWith(10);
      expect(result).toEqual({ data: [review], total: 1, page: 2, limit: 10 });
    });

    it('applies no filters by default', async () => {
      const { service, reviewQb } = buildService();

      await service.findAll({});

      expect(reviewQb.andWhere).not.toHaveBeenCalled();
      expect(reviewQb.skip).toHaveBeenCalledWith(0);
      expect(reviewQb.take).toHaveBeenCalledWith(20);
    });
  });

  it('findApproved forces product and approval filters over the query', async () => {
    const { service } = buildService();
    const spy = jest.spyOn(service, 'findAll');

    await service.findApproved('product-1', {
      product_id: 'other',
      isApproved: false,
    });

    expect(spy).toHaveBeenCalledWith({
      product_id: 'product-1',
      isApproved: true,
    });
  });

  it("findMyReviews forces the current user's id", async () => {
    const { service } = buildService();
    const spy = jest.spyOn(service, 'findAll');

    await service.findMyReviews('user-1', { user_id: 'other' });

    expect(spy).toHaveBeenCalledWith({ user_id: 'user-1' });
  });

  it('findOne throws NotFoundException when missing', async () => {
    const { service } = buildService();

    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });

  describe('update', () => {
    it('lets the owner edit and resets approval', async () => {
      const { service, reviewRepo } = buildService();
      reviewRepo.findOne.mockResolvedValue({ ...review });

      const result = await service.update(
        'review-1',
        'user-1',
        { rating: 2, title: undefined, content: 'Changed' },
        false,
      );

      expect(result).toEqual(
        expect.objectContaining({
          rating: 2,
          title: 'Good',
          content: 'Changed',
          isApproved: false,
        }),
      );
    });

    it('lets an admin edit any review without resetting approval', async () => {
      const { service, reviewRepo } = buildService();
      reviewRepo.findOne.mockResolvedValue({ ...review });

      const result = await service.update(
        'review-1',
        'admin-1',
        { title: null } as never,
        true,
      );

      expect(result).toEqual(
        expect.objectContaining({ title: null, isApproved: true }),
      );
    });

    it("rejects editing someone else's review", async () => {
      const { service, reviewRepo } = buildService();
      reviewRepo.findOne.mockResolvedValue({ ...review });

      await expect(
        service.update('review-1', 'user-2', { rating: 1 }, false),
      ).rejects.toThrow(ForbiddenException);
      expect(reviewRepo.save).not.toHaveBeenCalled();
    });
  });

  it.each([true, false])('approve sets isApproved=%p', async (approved) => {
    const { service, reviewRepo } = buildService();
    reviewRepo.findOne.mockResolvedValue({ ...review, isApproved: !approved });

    await expect(service.approve('review-1', approved)).resolves.toEqual(
      expect.objectContaining({ isApproved: approved }),
    );
  });

  describe('remove', () => {
    it.each([
      ['the owner', 'user-1', false],
      ['an admin', 'admin-1', true],
    ])('allows %s', async (_label, userId, isAdmin) => {
      const { service, reviewRepo } = buildService();
      reviewRepo.findOne.mockResolvedValue(review);

      await expect(
        service.remove('review-1', userId, isAdmin),
      ).resolves.toEqual({ success: true });
      expect(reviewRepo.remove).toHaveBeenCalledWith(review);
    });

    it('rejects other users', async () => {
      const { service, reviewRepo } = buildService();
      reviewRepo.findOne.mockResolvedValue(review);

      await expect(service.remove('review-1', 'user-2', false)).rejects.toThrow(
        ForbiddenException,
      );
      expect(reviewRepo.remove).not.toHaveBeenCalled();
    });
  });
});
