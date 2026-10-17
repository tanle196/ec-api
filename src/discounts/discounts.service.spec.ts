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
    usageLimit: null as number | null,
    usedCount: 0,
    isActive: true,
    startsAt: null as Date | null,
    expiresAt: null as Date | null,
  };

  const buildService = () => {
    const repo = {
      findOne: jest.fn().mockResolvedValue(null),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      create: jest.fn((d: object) => ({ ...d })),
      save: jest.fn((d: object) => Promise.resolve(d)),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    return { service: new DiscountsService(repo as never), repo };
  };

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

  describe('computeAmount', () => {
    const { service } = buildService();

    it('computes a percentage of the subtotal rounded to 2dp', () => {
      expect(
        service.computeAmount({ ...discount, value: '15' } as never, 99.99),
      ).toBe(15);
      expect(
        service.computeAmount({ ...discount, value: '10' } as never, 0.3),
      ).toBe(0.03);
    });

    it('returns a fixed value', () => {
      expect(
        service.computeAmount(
          { ...discount, type: DiscountType.FIXED, value: '30.00' } as never,
          100,
        ),
      ).toBe(30);
    });

    it('caps a fixed discount at the subtotal', () => {
      expect(
        service.computeAmount(
          { ...discount, type: DiscountType.FIXED, value: '500' } as never,
          120,
        ),
      ).toBe(120);
    });
  });

  it('validate returns the resolved code with its computed amount', async () => {
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

  describe('incrementUsedCount', () => {
    const buildManager = (affected: number) => {
      const qb = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue({ affected }),
      };
      return { manager: { createQueryBuilder: () => qb }, qb };
    };

    it('increments with a conditional update guarding the usage limit', async () => {
      const { service } = buildService();
      const { manager, qb } = buildManager(1);

      await service.incrementUsedCount(manager as never, 'd-1');

      expect(qb.where).toHaveBeenCalledWith(
        'id = :id AND ("usageLimit" IS NULL OR "usedCount" < "usageLimit")',
        { id: 'd-1' },
      );
      const { usedCount } = (qb.set.mock.calls as unknown[][])[0][0] as {
        usedCount: () => string;
      };
      expect(usedCount()).toBe('"usedCount" + 1');
    });

    it('throws when the limit was reached concurrently', async () => {
      const { service } = buildService();
      const { manager } = buildManager(0);

      await expect(
        service.incrementUsedCount(manager as never, 'd-1'),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
