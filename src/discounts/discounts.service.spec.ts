import { DiscountPolicy } from './policies/discount.policy';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { DiscountsService } from './discounts.service';
import { DiscountType } from './enums/discount-type.enum';

describe('DiscountsService', () => {
  const discount = {
    id: 'd-1',
    code: 'SALE10',
    type: DiscountType.PERCENT,
    value: '10.00',
    minOrderValue: null as string | null,
    maxDiscountAmount: null as number | null,
    usageLimit: null as number | null,
    perUserLimit: null as number | null,
    productIds: null as string[] | null,
    categoryIds: null as string[] | null,
    usedCount: 0,
    isActive: true,
    startsAt: null as Date | null,
    expiresAt: null as Date | null,
  };

  const buildManager = (affected = 1) => {
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected }),
    };
    const manager = {
      createQueryBuilder: jest.fn(() => qb),
      count: jest.fn().mockResolvedValue(0),
      find: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      create: jest.fn((_e: unknown, d: object) => ({ ...d })),
      save: jest.fn((_e: unknown, d: object) => Promise.resolve(d)),
      // Category tree lookup: returns the roots plus whatever children the
      // test registered in `categoryChildren`.
      query: jest.fn((_sql: string, [roots]: [string[]]) =>
        Promise.resolve(
          roots
            .flatMap((id) => [id, ...(categoryChildren[id] ?? [])])
            .map((id) => ({ id })),
        ),
      ),
    };
    const categoryChildren: Record<string, string[]> = {};
    return { manager, qb, categoryChildren };
  };

  const buildService = () => {
    const { manager, qb, categoryChildren } = buildManager();
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      create: jest.fn((d: object) => ({ ...d })),
      save: jest.fn((d: object) => Promise.resolve(d)),
      remove: jest.fn().mockResolvedValue(undefined),
      manager,
    };
    const variantRepo = { find: jest.fn().mockResolvedValue([]) };
    return {
      service: new DiscountsService(
        repo as never,
        variantRepo as never,
        new DiscountPolicy(),
      ),
      repo,
      variantRepo,
      manager,
      qb,
      categoryChildren,
    };
  };

  const line = (amount: number, productId = 'p-1', categoryId = 'c-1') => ({
    productId,
    categoryId,
    amount,
  });

  describe('create', () => {
    it('uppercases the code and defaults isActive', async () => {
      const { service, repo } = buildService();

      const result = await service.create({
        code: 'sale10',
        type: DiscountType.PERCENT,
        value: 10,
      });

      expect(repo.findOne).toHaveBeenCalledWith({ where: { code: 'SALE10' } });
      expect(result).toEqual(
        expect.objectContaining({ code: 'SALE10', isActive: true }),
      );
    });

    it('rejects a percent value above 100', async () => {
      const { service, repo } = buildService();

      await expect(
        service.create({
          code: 'huge',
          type: DiscountType.PERCENT,
          value: 150,
        }),
      ).rejects.toThrow('Percent discount value must be between 0 and 100');
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('allows a fixed value above 100', async () => {
      const { service } = buildService();

      await expect(
        service.create({
          code: 'fixed',
          type: DiscountType.FIXED,
          value: 50000,
        }),
      ).resolves.toEqual(expect.objectContaining({ value: 50000 }));
    });

    it('rejects a duplicate code regardless of case', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(discount);

      await expect(service.create({ code: 'sale10' } as never)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  it('findAll filters by code search and isActive', async () => {
    const { service, repo } = buildService();

    await service.findAll({
      page: 2,
      limit: 5,
      search: 'sale',
      isActive: true,
    });

    expect(repo.findAndCount).toHaveBeenCalledWith({
      where: {
        code: expect.objectContaining({
          _type: 'ilike',
          _value: '%sale%',
        }) as unknown,
        isActive: true,
      },
      order: { createdAt: 'DESC' },
      skip: 5,
      take: 5,
    });
  });

  it('findAll uses defaults without filters', async () => {
    const { service, repo } = buildService();

    await expect(service.findAll({})).resolves.toEqual({
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });
    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, skip: 0 }),
    );
  });

  it('findOne throws NotFoundException when missing', async () => {
    const { service } = buildService();

    await expect(service.findOne('x')).rejects.toThrow(NotFoundException);
  });

  describe('update', () => {
    it('uppercases a changed code after checking for conflicts', async () => {
      const { service, repo } = buildService();
      repo.findOne
        .mockResolvedValueOnce({ ...discount })
        .mockResolvedValueOnce(null);

      const result = await service.update('d-1', { code: 'new20' });

      expect(repo.findOne).toHaveBeenLastCalledWith({
        where: { code: 'NEW20' },
      });
      expect(result.code).toBe('NEW20');
    });

    it('rejects a code used by another discount', async () => {
      const { service, repo } = buildService();
      repo.findOne
        .mockResolvedValueOnce({ ...discount })
        .mockResolvedValueOnce({ id: 'd-2' });

      await expect(service.update('d-1', { code: 'other' })).rejects.toThrow(
        ConflictException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it.each([
      ['raising a percent value above 100', { value: 101 }, discount],
      [
        'switching a large fixed value to percent',
        { type: DiscountType.PERCENT },
        { ...discount, type: DiscountType.FIXED, value: '50000.00' },
      ],
    ])('rejects %s', async (_label, dto, existing) => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValueOnce({ ...existing });

      await expect(service.update('d-1', dto)).rejects.toThrow(
        BadRequestException,
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('skips the conflict check when the code is unchanged', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValueOnce({ ...discount });

      await service.update('d-1', { code: 'sale10', isActive: false });

      expect(repo.findOne).toHaveBeenCalledTimes(1);
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false }),
      );
    });
  });

  it('remove deletes the discount', async () => {
    const { service, repo } = buildService();
    repo.findOne.mockResolvedValue(discount);

    await service.remove('d-1');

    expect(repo.remove).toHaveBeenCalledWith(discount);
  });

  describe('resolveCode', () => {
    const DAY = 24 * 60 * 60 * 1000;

    it('returns a valid discount looked up case-insensitively', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(discount);

      await expect(service.resolveCode('sale10', 100)).resolves.toBe(discount);
      expect(repo.findOne).toHaveBeenCalledWith({ where: { code: 'SALE10' } });
    });

    it('throws NotFoundException for an unknown code', async () => {
      const { service } = buildService();

      await expect(service.resolveCode('nope', 100)).rejects.toThrow(
        NotFoundException,
      );
    });

    it.each([
      ['inactive', { isActive: false }, 'Discount code is inactive'],
      [
        'not started',
        { startsAt: new Date(Date.now() + DAY) },
        'Discount code is not yet valid',
      ],
      [
        'expired',
        { expiresAt: new Date(Date.now() - DAY) },
        'Discount code has expired',
      ],
      [
        'used up',
        { usageLimit: 5, usedCount: 5 },
        'Discount code has reached its usage limit',
      ],
      [
        'below minimum order value',
        { minOrderValue: '200.00' },
        'Minimum order value for this code is 200.00',
      ],
    ])('rejects a code that is %s', async (_label, overrides, message) => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({ ...discount, ...overrides });

      await expect(service.resolveCode('SALE10', 100)).rejects.toThrow(
        new BadRequestException(message),
      );
    });

    it('accepts a code within its window, under its limit and above the minimum', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({
        ...discount,
        startsAt: new Date(Date.now() - DAY),
        expiresAt: new Date(Date.now() + DAY),
        usageLimit: 5,
        usedCount: 4,
        minOrderValue: '100.00',
      });

      await expect(service.resolveCode('SALE10', 100)).resolves.toBeDefined();
    });
  });

  describe('resolveCode per-user limit', () => {
    it('rejects a customer who already used up their uses', async () => {
      const { service, repo, manager } = buildService();
      repo.findOne.mockResolvedValue({ ...discount, perUserLimit: 1 });
      manager.count.mockResolvedValue(1);

      await expect(
        service.resolveCode('SALE10', 100, 'user-1'),
      ).rejects.toThrow(
        'You have already used this discount code the maximum number of times',
      );
    });

    it('skips the count when the code has no per-user limit', async () => {
      const { service, repo, manager } = buildService();
      repo.findOne.mockResolvedValue(discount);

      await service.resolveCode('SALE10', 100, 'user-1');

      expect(manager.count).not.toHaveBeenCalled();
    });
  });

  describe('quote', () => {
    it('computes a percentage of the lines rounded to 2dp', async () => {
      const { service } = buildService();
      await expect(
        service.quote({ ...discount, value: '15' } as never, [line(99.99)]),
      ).resolves.toEqual({ amount: 15, lineAmounts: [15] });
    });

    it('returns a fixed value split across lines by amount', async () => {
      const { service } = buildService();
      await expect(
        service.quote(
          { ...discount, type: DiscountType.FIXED, value: '30.00' } as never,
          [line(100), line(200)],
        ),
      ).resolves.toEqual({ amount: 30, lineAmounts: [10, 20] });
    });

    it('caps a percent discount at maxDiscountAmount', async () => {
      const { service } = buildService();
      const { amount } = await service.quote(
        { ...discount, value: '50', maxDiscountAmount: 40 } as never,
        [line(200)],
      );
      expect(amount).toBe(40);
    });

    it('caps a percent discount at the lines', async () => {
      const { service } = buildService();
      const { amount } = await service.quote(
        { ...discount, value: '150' } as never,
        [line(200)],
      );
      expect(amount).toBe(200);
    });

    it('caps a fixed discount at the lines', async () => {
      const { service } = buildService();
      const { amount } = await service.quote(
        { ...discount, type: DiscountType.FIXED, value: '500' } as never,
        [line(120)],
      );
      expect(amount).toBe(120);
    });

    it('only discounts lines of the listed products', async () => {
      const { service } = buildService();
      await expect(
        service.quote({ ...discount, productIds: ['p-2'] } as never, [
          line(100, 'p-1'),
          line(300, 'p-2'),
        ]),
      ).resolves.toEqual({ amount: 30, lineAmounts: [0, 30] });
    });

    it('includes sub-categories of a listed category', async () => {
      const { service, categoryChildren } = buildService();
      categoryChildren['c-parent'] = ['c-child'];

      const { lineAmounts } = await service.quote(
        { ...discount, categoryIds: ['c-parent'] } as never,
        [line(100, 'p-1', 'c-child'), line(100, 'p-2', 'c-other')],
      );

      expect(lineAmounts).toEqual([10, 0]);
    });

    it('rejects a scoped code that matches no line', async () => {
      const { service } = buildService();
      await expect(
        service.quote({ ...discount, productIds: ['p-9'] } as never, [
          line(100),
        ]),
      ).rejects.toThrow(
        'Discount code "SALE10" does not apply to any item in this order',
      );
    });
  });

  describe('validate', () => {
    it('returns the resolved code with its computed amount', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue(discount);

      await expect(
        service.validate({ code: 'sale10', subtotal: 250 }),
      ).resolves.toEqual({
        discountId: 'd-1',
        code: 'SALE10',
        type: DiscountType.PERCENT,
        value: 10,
        discountAmount: 25,
      });
    });

    it('prices items from current variant prices', async () => {
      const { service, repo, variantRepo } = buildService();
      repo.findOne.mockResolvedValue({ ...discount, productIds: ['p-1'] });
      variantRepo.find.mockResolvedValue([
        { id: 'v-1', price: '50.00', product: { id: 'p-1', category_id: 'c' } },
        { id: 'v-2', price: '80.00', product: { id: 'p-2', category_id: 'c' } },
      ]);

      const result = await service.validate({
        code: 'sale10',
        items: [
          { variant_id: 'v-1', quantity: 2 },
          { variant_id: 'v-2', quantity: 1 },
        ],
      });

      expect(result.discountAmount).toBe(10);
    });

    it('requires items for a scoped code', async () => {
      const { service, repo } = buildService();
      repo.findOne.mockResolvedValue({ ...discount, productIds: ['p-1'] });

      await expect(
        service.validate({ code: 'sale10', subtotal: 100 }),
      ).rejects.toThrow(BadRequestException);
    });

    it('requires items or a subtotal', async () => {
      const { service } = buildService();
      await expect(service.validate({ code: 'sale10' })).rejects.toThrow(
        'Either items or subtotal is required',
      );
    });
  });

  describe('redeem', () => {
    const params = (overrides: object = {}) => ({
      discount: { ...discount, ...overrides } as never,
      orderId: 'order-1',
      userId: 'user-1',
      amount: 25,
    });

    it('increments with a conditional update guarding the usage limit and records the redemption', async () => {
      const { service } = buildService();
      const { manager, qb } = buildManager(1);

      await service.redeem(manager as never, params());

      expect(qb.where).toHaveBeenCalledWith(
        'id = :id AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")',
        { id: 'd-1' },
      );
      const { usedCount } = (qb.set.mock.calls as unknown[][])[0][0] as {
        usedCount: () => string;
      };
      expect(usedCount()).toBe('"usedCount" + 1');
      expect(manager.save).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          discount_id: 'd-1',
          order_id: 'order-1',
          user_id: 'user-1',
          amount: 25,
          status: 'active',
        }),
      );
    });

    it('throws when the limit was reached concurrently', async () => {
      const { service } = buildService();
      const { manager } = buildManager(0);

      await expect(service.redeem(manager as never, params())).rejects.toThrow(
        'Discount code has reached its usage limit',
      );
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('re-checks the per-user limit after taking the lock', async () => {
      const { service } = buildService();
      const { manager } = buildManager(1);
      manager.count.mockResolvedValue(2);

      await expect(
        service.redeem(manager as never, params({ perUserLimit: 2 })),
      ).rejects.toThrow(BadRequestException);
      expect(manager.save).not.toHaveBeenCalled();
    });
  });

  describe('releaseForOrder', () => {
    it('releases active redemptions and gives the uses back', async () => {
      const { service } = buildService();
      const { manager, qb } = buildManager(1);
      manager.find.mockResolvedValue([{ id: 'r-1', discount_id: 'd-1' }]);

      await service.releaseForOrder(manager as never, 'order-1');

      expect(manager.find).toHaveBeenCalledWith(expect.anything(), {
        where: { order_id: 'order-1', status: 'active' },
      });
      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        'r-1',
        expect.objectContaining({ status: 'released' }),
      );
      expect(qb.where).toHaveBeenCalledWith('id = :id AND "usedCount" > 0', {
        id: 'd-1',
      });
    });

    it('is a no-op when nothing is active', async () => {
      const { service } = buildService();
      const { manager } = buildManager(1);

      await service.releaseForOrder(manager as never, 'order-1');

      expect(manager.update).not.toHaveBeenCalled();
      expect(manager.createQueryBuilder).not.toHaveBeenCalled();
    });
  });
});
