import { ConflictException, NotFoundException } from '@nestjs/common';
import { WishlistsService } from './wishlists.service';

describe('WishlistsService', () => {
  const item = { id: 'w-1', user_id: 'user-1', product_id: 'product-1' };

  const buildService = () => {
    const wishlistRepo = {
      find: jest.fn().mockResolvedValue([item]),
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((d: object) => ({ ...d })),
      save: jest.fn((d: object) => Promise.resolve(d)),
      remove: jest.fn().mockResolvedValue(undefined),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const productRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'product-1' }),
    };
    const service = new WishlistsService(
      wishlistRepo as never,
      productRepo as never,
    );
    return { service, wishlistRepo, productRepo };
  };

  it('getWishlist returns the user items newest first with a total', async () => {
    const { service, wishlistRepo } = buildService();

    await expect(service.getWishlist('user-1')).resolves.toEqual({
      items: [item],
      total: 1,
    });
    expect(wishlistRepo.find).toHaveBeenCalledWith({
      where: { user_id: 'user-1' },
      relations: ['product'],
      order: { createdAt: 'DESC' },
    });
  });

  describe('addProduct', () => {
    it('adds the product and returns the wishlist', async () => {
      const { service, wishlistRepo } = buildService();

      const result = await service.addProduct('user-1', {
        product_id: 'product-1',
      });

      expect(wishlistRepo.save).toHaveBeenCalledWith({
        user_id: 'user-1',
        product_id: 'product-1',
      });
      expect(result.total).toBe(1);
    });

    it('rejects an unknown product', async () => {
      const { service, productRepo, wishlistRepo } = buildService();
      productRepo.findOne.mockResolvedValue(null);

      await expect(
        service.addProduct('user-1', { product_id: 'x' }),
      ).rejects.toThrow(NotFoundException);
      expect(wishlistRepo.save).not.toHaveBeenCalled();
    });

    it('rejects a duplicate', async () => {
      const { service, wishlistRepo } = buildService();
      wishlistRepo.findOne.mockResolvedValue(item);

      await expect(
        service.addProduct('user-1', { product_id: 'product-1' }),
      ).rejects.toThrow(ConflictException);
      expect(wishlistRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('removeProduct', () => {
    it("removes only the user's own item", async () => {
      const { service, wishlistRepo } = buildService();
      wishlistRepo.findOne.mockResolvedValue(item);

      await service.removeProduct('user-1', 'product-1');

      expect(wishlistRepo.findOne).toHaveBeenCalledWith({
        where: { user_id: 'user-1', product_id: 'product-1' },
      });
      expect(wishlistRepo.remove).toHaveBeenCalledWith(item);
    });

    it('throws NotFoundException when the product is not in the wishlist', async () => {
      const { service, wishlistRepo } = buildService();

      await expect(service.removeProduct('user-1', 'x')).rejects.toThrow(
        NotFoundException,
      );
      expect(wishlistRepo.remove).not.toHaveBeenCalled();
    });
  });

  it('clearWishlist deletes all of the user items', async () => {
    const { service, wishlistRepo } = buildService();

    await service.clearWishlist('user-1');

    expect(wishlistRepo.delete).toHaveBeenCalledWith({ user_id: 'user-1' });
  });
});
