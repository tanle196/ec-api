import {
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { CartsService } from './carts.service';

describe('CartsService', () => {
  const cart = { id: 'cart-1', user_id: 'user-1', items: [] };
  const variant = { id: 'variant-1', stock: 10, isActive: true };

  const buildService = () => {
    const cartRepo = {
      findOne: jest.fn().mockResolvedValue(cart),
      create: jest.fn((d: object) => ({ ...d })),
      save: jest.fn((d: object) => Promise.resolve({ id: 'cart-new', ...d })),
    };
    const itemRepo = {
      findOne: jest.fn(),
      save: jest.fn((d: object) => Promise.resolve(d)),
      remove: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const variantRepo = { findOne: jest.fn().mockResolvedValue(variant) };
    const manager = {
      findOne: jest.fn().mockResolvedValue(variant),
      query: jest.fn().mockResolvedValue([{ quantity: 1 }]),
    };
    const dataSource = {
      transaction: jest.fn((cb: (m: unknown) => Promise<unknown>) =>
        cb(manager),
      ),
    };
    const service = new CartsService(
      cartRepo as never,
      itemRepo as never,
      variantRepo as never,
      dataSource as never,
    );
    return { service, cartRepo, itemRepo, variantRepo, manager, dataSource };
  };

  describe('getCart', () => {
    it('returns the existing cart with items and variants', async () => {
      const { service, cartRepo } = buildService();

      await expect(service.getCart('user-1')).resolves.toBe(cart);
      expect(cartRepo.findOne).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
        relations: ['items', 'items.variant'],
      });
    });

    it('lazily creates an empty cart', async () => {
      const { service, cartRepo } = buildService();
      cartRepo.findOne.mockResolvedValue(null);

      await expect(service.getCart('user-1')).resolves.toEqual({
        id: 'cart-new',
        user_id: 'user-1',
        items: [],
      });
    });
  });

  describe('addItem', () => {
    it('upserts the item with quantity 1 by default under a stock lock', async () => {
      const { service, manager } = buildService();

      await service.addItem('user-1', { variant_id: 'variant-1' });

      expect(manager.findOne).toHaveBeenCalledWith(ProductVariant, {
        where: { id: 'variant-1' },
        lock: { mode: 'pessimistic_read' },
      });
      const [sql, params] = manager.query.mock.calls[0] as [string, unknown[]];
      expect(sql).toContain('ON CONFLICT ("cart_id", "variant_id")');
      expect(params).toEqual(['cart-1', 'variant-1', 1]);
    });

    it('passes the requested quantity', async () => {
      const { service, manager } = buildService();
      manager.query.mockResolvedValue([{ quantity: 3 }]);

      await service.addItem('user-1', { variant_id: 'variant-1', quantity: 3 });

      expect((manager.query.mock.calls as unknown[][])[0][1]).toEqual([
        'cart-1',
        'variant-1',
        3,
      ]);
    });

    it('rejects an unknown variant', async () => {
      const { service, variantRepo, dataSource } = buildService();
      variantRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addItem('user-1', { variant_id: 'x' }),
      ).rejects.toThrow(NotFoundException);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects an inactive variant', async () => {
      const { service, variantRepo } = buildService();
      variantRepo.findOne.mockResolvedValue({ ...variant, isActive: false });

      await expect(
        service.addItem('user-1', { variant_id: 'variant-1' }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('rejects a quantity above current stock before touching the cart', async () => {
      const { service, dataSource } = buildService();

      await expect(
        service.addItem('user-1', { variant_id: 'variant-1', quantity: 11 }),
      ).rejects.toThrow('Insufficient stock: available 10, requested 11');
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('rejects (and rolls back) when the merged quantity exceeds fresh stock', async () => {
      const { service, manager } = buildService();
      manager.findOne.mockResolvedValue({ ...variant, stock: 4 });
      manager.query.mockResolvedValue([{ quantity: 5 }]);

      await expect(
        service.addItem('user-1', { variant_id: 'variant-1', quantity: 2 }),
      ).rejects.toThrow('Insufficient stock: available 4, requested 5');
    });

    it('rejects when the variant disappears inside the transaction', async () => {
      const { service, manager } = buildService();
      manager.findOne.mockResolvedValue(null);

      await expect(
        service.addItem('user-1', { variant_id: 'variant-1' }),
      ).rejects.toThrow(NotFoundException);
      expect(manager.query).not.toHaveBeenCalled();
    });
  });

  describe('updateItem', () => {
    const item = {
      id: 'item-1',
      cart_id: 'cart-1',
      variant_id: 'variant-1',
      quantity: 1,
    };

    it("updates the quantity of an item in the user's cart", async () => {
      const { service, itemRepo } = buildService();
      itemRepo.findOne.mockResolvedValue({ ...item });

      await service.updateItem('user-1', 'item-1', { quantity: 5 });

      expect(itemRepo.findOne).toHaveBeenCalledWith({
        where: { id: 'item-1', cart_id: 'cart-1' },
      });
      expect(itemRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ quantity: 5 }),
      );
    });

    it('rejects an item outside the cart', async () => {
      const { service, itemRepo } = buildService();
      itemRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateItem('user-1', 'x', { quantity: 1 }),
      ).rejects.toThrow(NotFoundException);
    });

    it('rejects a quantity above stock', async () => {
      const { service, itemRepo } = buildService();
      itemRepo.findOne.mockResolvedValue({ ...item });

      await expect(
        service.updateItem('user-1', 'item-1', { quantity: 11 }),
      ).rejects.toThrow(UnprocessableEntityException);
      expect(itemRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('removeItem', () => {
    it("removes an item from the user's cart", async () => {
      const { service, itemRepo } = buildService();
      const item = { id: 'item-1' };
      itemRepo.findOne.mockResolvedValue(item);

      await service.removeItem('user-1', 'item-1');

      expect(itemRepo.remove).toHaveBeenCalledWith(item);
    });

    it('rejects an unknown item', async () => {
      const { service, itemRepo } = buildService();
      itemRepo.findOne.mockResolvedValue(null);

      await expect(service.removeItem('user-1', 'x')).rejects.toThrow(
        NotFoundException,
      );
      expect(itemRepo.remove).not.toHaveBeenCalled();
    });
  });

  it('clearCart deletes all items in the cart', async () => {
    const { service, itemRepo } = buildService();

    await service.clearCart('user-1');

    expect(itemRepo.delete).toHaveBeenCalledWith({ cart_id: 'cart-1' });
  });
});
