import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminOrdersController } from './admin-orders.controller';
import { OrderStatus } from './enums/order-status.enum';
import { OrderStatusChangeActor } from './enums/order-status-change-actor.enum';
import { OrdersController } from './orders.controller';
import { OrderMapper } from './mapper/order.mapper';

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
    findAll: jest
      .fn()
      .mockResolvedValue({ data: ['findAll'], total: 1, page: 1, limit: 20 }),
    findOne: jest.fn().mockResolvedValue('findOne'),
    update: jest.fn().mockResolvedValue('update'),
    cancel: jest.fn().mockResolvedValue('cancel'),
    getStatusHistory: jest.fn().mockResolvedValue('history'),
    updateStatus: jest.fn().mockResolvedValue('updateStatus'),
  };
  const user = { id: 'user-1' } as never;
  const listPage = {
    data: [{ list: 'findAll' }],
    total: 1,
    page: 1,
    limit: 20,
  };

  beforeAll(() => {
    jest
      .spyOn(OrderMapper, 'toResponse')
      .mockImplementation((o) => ({ order: o }) as never);
    jest
      .spyOn(OrderMapper, 'toListItem')
      .mockImplementation((o) => ({ list: o }) as never);
    jest
      .spyOn(OrderMapper, 'toStatusHistoryList')
      .mockImplementation((h) => ({ history: h }) as never);
  });

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

      await expect(controller.create(user, dto)).resolves.toEqual({
        order: 'create',
      });
      await expect(
        controller.checkout(user, { address_id: 'a' }),
      ).resolves.toEqual({ order: 'checkout' });

      expect(service.create).toHaveBeenCalledWith('user-1', dto);
      expect(service.checkout).toHaveBeenCalledWith('user-1', {
        address_id: 'a',
      });
    });

    it('findMine lists only the current user orders (non-admin)', async () => {
      await expect(controller.findMine(user, { page: 1 })).resolves.toEqual(
        listPage,
      );

      expect(service.findAll).toHaveBeenCalledWith(
        { page: 1 },
        'user-1',
        false,
      );
    });

    it('scopes single-order endpoints to the current user', async () => {
      await expect(controller.findMineOne(user, 'o')).resolves.toEqual({
        order: 'findOne',
      });
      await expect(
        controller.update(user, 'o', { notes: 'n' }),
      ).resolves.toEqual({ order: 'update' });
      await expect(controller.cancel(user, 'o')).resolves.toEqual({
        order: 'cancel',
      });
      await expect(controller.getHistory(user, 'o')).resolves.toEqual({
        history: 'history',
      });

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
      await expect(controller.findAll({ page: 1 })).resolves.toEqual(listPage);

      expect(service.findAll).toHaveBeenCalledWith(
        { page: 1 },
        undefined,
        true,
      );
    });

    it('findOne and getHistory are not user-scoped', async () => {
      await expect(controller.findOne('o')).resolves.toEqual({
        order: 'findOne',
      });
      await expect(controller.getHistory('o')).resolves.toEqual({
        history: 'history',
      });

      expect(service.findOne).toHaveBeenCalledWith('o');
      expect(service.getStatusHistory).toHaveBeenCalledWith('o');
    });

    it('updateStatus records the admin as the actor', async () => {
      const dto = { status: OrderStatus.SHIPPED };

      await expect(
        controller.updateStatus({ id: 'admin-1' } as never, 'o', dto),
      ).resolves.toEqual({ order: 'updateStatus' });

      expect(service.updateStatus).toHaveBeenCalledWith('o', dto, {
        actorType: OrderStatusChangeActor.ADMIN,
        actorId: 'admin-1',
      });
    });
  });
});
