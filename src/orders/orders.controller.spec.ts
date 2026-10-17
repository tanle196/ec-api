import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminOrdersController } from './admin-orders.controller';
import { OrderStatus } from './enums/order-status.enum';
import { OrderStatusChangeActor } from './enums/order-status-change-actor.enum';
import { OrdersController } from './orders.controller';

const permissionsOf = (method: string) =>
  Reflect.getMetadata(
    'permissions',
    Object.getOwnPropertyDescriptor(AdminOrdersController.prototype, method)
      ?.value as object,
  ) as string[];

describe('Order controllers', () => {
  const service = {
    create: jest.fn().mockResolvedValue('create'),
    checkout: jest.fn().mockResolvedValue('checkout'),
    findAll: jest.fn().mockResolvedValue('findAll'),
    findOne: jest.fn().mockResolvedValue('findOne'),
    update: jest.fn().mockResolvedValue('update'),
    cancel: jest.fn().mockResolvedValue('cancel'),
    getStatusHistory: jest.fn().mockResolvedValue('history'),
    updateStatus: jest.fn().mockResolvedValue('updateStatus'),
  };
  const user = { id: 'user-1' } as never;

  beforeEach(() => jest.clearAllMocks());

  describe('OrdersController', () => {
    const controller = new OrdersController(service as never);

    it('is protected by JwtAuthGuard', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, OrdersController)).toEqual([
        JwtAuthGuard,
      ]);
    });

    it('create and checkout use the current user', async () => {
      const dto = { address_id: 'a', items: [] };

      await expect(controller.create(user, dto)).resolves.toBe('create');
      await expect(
        controller.checkout(user, { address_id: 'a' }),
      ).resolves.toBe('checkout');

      expect(service.create).toHaveBeenCalledWith('user-1', dto);
      expect(service.checkout).toHaveBeenCalledWith('user-1', {
        address_id: 'a',
      });
    });

    it('findMine lists only the current user orders (non-admin)', async () => {
      await controller.findMine(user, { page: 1 });

      expect(service.findAll).toHaveBeenCalledWith(
        { page: 1 },
        'user-1',
        false,
      );
    });

    it('scopes single-order endpoints to the current user', async () => {
      await controller.findMineOne(user, 'o');
      await controller.update(user, 'o', { notes: 'n' });
      await controller.cancel(user, 'o');
      await controller.getHistory(user, 'o');

      expect(service.findOne).toHaveBeenCalledWith('o', 'user-1');
      expect(service.update).toHaveBeenCalledWith('o', 'user-1', {
        notes: 'n',
      });
      expect(service.cancel).toHaveBeenCalledWith('o', 'user-1');
      expect(service.getStatusHistory).toHaveBeenCalledWith('o', 'user-1');
    });
  });

  describe('AdminOrdersController', () => {
    const controller = new AdminOrdersController(service as never);

    it('is protected by JwtAuthGuard and PermissionsGuard', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, AdminOrdersController),
      ).toEqual([JwtAuthGuard, PermissionsGuard]);
    });

    it.each([
      ['findAll', 'order.read'],
      ['findOne', 'order.read'],
      ['updateStatus', 'order.update'],
      ['getHistory', 'order.read'],
    ])('%s requires %s', (method, perm) => {
      expect(permissionsOf(method)).toEqual([perm]);
    });

    it('findAll lists all orders as admin', async () => {
      await controller.findAll({ page: 1 });

      expect(service.findAll).toHaveBeenCalledWith(
        { page: 1 },
        undefined,
        true,
      );
    });

    it('findOne and getHistory are not user-scoped', async () => {
      await controller.findOne('o');
      await controller.getHistory('o');

      expect(service.findOne).toHaveBeenCalledWith('o');
      expect(service.getStatusHistory).toHaveBeenCalledWith('o');
    });

    it('updateStatus records the admin as the actor', async () => {
      const dto = { status: OrderStatus.SHIPPED };

      await controller.updateStatus({ id: 'admin-1' } as never, 'o', dto);

      expect(service.updateStatus).toHaveBeenCalledWith('o', dto, {
        actorType: OrderStatusChangeActor.ADMIN,
        actorId: 'admin-1',
      });
    });
  });
});
