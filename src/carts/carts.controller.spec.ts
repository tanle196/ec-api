import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { CartsController } from './carts.controller';

describe('CartsController', () => {
  const user = { id: 'user-1' } as never;
  const service = {
    getCart: jest.fn().mockResolvedValue('getCart'),
    addItem: jest.fn().mockResolvedValue('addItem'),
    updateItem: jest.fn().mockResolvedValue('updateItem'),
    removeItem: jest.fn().mockResolvedValue('removeItem'),
    clearCart: jest.fn().mockResolvedValue('clearCart'),
  };
  const controller = new CartsController(service as never);

  it('is protected by JwtAuthGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, CartsController)).toEqual([
      JwtAuthGuard,
    ]);
  });

  it('scopes every call to the current user', async () => {
    const add = { variant_id: 'v', quantity: 2 };

    await expect(controller.getCart(user)).resolves.toBe('getCart');
    await expect(controller.addItem(user, add)).resolves.toBe('addItem');
    await expect(
      controller.updateItem(user, 'item-1', { quantity: 3 }),
    ).resolves.toBe('updateItem');
    await expect(controller.removeItem(user, 'item-1')).resolves.toBe(
      'removeItem',
    );
    await expect(controller.clearCart(user)).resolves.toBe('clearCart');

    expect(service.getCart).toHaveBeenCalledWith('user-1');
    expect(service.addItem).toHaveBeenCalledWith('user-1', add);
    expect(service.updateItem).toHaveBeenCalledWith('user-1', 'item-1', {
      quantity: 3,
    });
    expect(service.removeItem).toHaveBeenCalledWith('user-1', 'item-1');
    expect(service.clearCart).toHaveBeenCalledWith('user-1');
  });
});
