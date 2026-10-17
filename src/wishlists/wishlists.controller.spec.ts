import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { WishlistsController } from './wishlists.controller';

describe('WishlistsController', () => {
  const user = { id: 'user-1' } as never;
  const service = {
    getWishlist: jest.fn().mockResolvedValue('getWishlist'),
    addProduct: jest.fn().mockResolvedValue('addProduct'),
    removeProduct: jest.fn().mockResolvedValue('removeProduct'),
    clearWishlist: jest.fn().mockResolvedValue('clearWishlist'),
  };
  const controller = new WishlistsController(service as never);

  it('is protected by JwtAuthGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, WishlistsController)).toEqual([
      JwtAuthGuard,
    ]);
  });

  it('scopes every call to the current user', async () => {
    await expect(controller.getWishlist(user)).resolves.toBe('getWishlist');
    await expect(
      controller.addProduct(user, { product_id: 'p' }),
    ).resolves.toBe('addProduct');
    await expect(controller.removeProduct(user, 'p')).resolves.toBe(
      'removeProduct',
    );
    await expect(controller.clearWishlist(user)).resolves.toBe('clearWishlist');

    expect(service.getWishlist).toHaveBeenCalledWith('user-1');
    expect(service.addProduct).toHaveBeenCalledWith('user-1', {
      product_id: 'p',
    });
    expect(service.removeProduct).toHaveBeenCalledWith('user-1', 'p');
    expect(service.clearWishlist).toHaveBeenCalledWith('user-1');
  });
});
