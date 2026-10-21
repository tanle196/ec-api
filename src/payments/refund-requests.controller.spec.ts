import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminRefundRequestsController } from './admin-refund-requests.controller';
import { RefundRequestsController } from './refund-requests.controller';
import { RefundRequestMapper } from './mapper/refund-request.mapper';

const permissionsOf = (method: string) =>
  Reflect.getMetadata(
    'permissions',
    Object.getOwnPropertyDescriptor(
      AdminRefundRequestsController.prototype,
      method,
    )?.value as object,
  ) as string[];

describe('Refund request controllers', () => {
  const service = {
    create: jest.fn().mockResolvedValue('create'),
    findMine: jest
      .fn()
      .mockResolvedValue({ data: ['findMine'], total: 1, page: 1, limit: 20 }),
    findMineOne: jest.fn().mockResolvedValue('findMineOne'),
    findAll: jest
      .fn()
      .mockResolvedValue({ data: ['findAll'], total: 1, page: 1, limit: 20 }),
    findOne: jest.fn().mockResolvedValue('findOne'),
    approve: jest.fn().mockResolvedValue('approve'),
    reject: jest.fn().mockResolvedValue('reject'),
  };

  beforeAll(() => {
    jest
      .spyOn(RefundRequestMapper, 'toResponse')
      .mockImplementation((r) => ({ public: r }) as never);
    jest
      .spyOn(RefundRequestMapper, 'toAdminResponse')
      .mockImplementation((r) => ({ admin: r }) as never);
  });

  beforeEach(() => jest.clearAllMocks());

  describe('RefundRequestsController', () => {
    const controller = new RefundRequestsController(service as never);
    const user = { id: 'user-1' } as never;

    it('is protected by JwtAuthGuard', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, RefundRequestsController),
      ).toEqual([JwtAuthGuard]);
    });

    it('scopes every call to the current user', async () => {
      const dto = { order_id: 'o', reason: 'damaged' };

      await expect(controller.create(user, dto as never)).resolves.toEqual({
        public: 'create',
      });
      await expect(controller.findMine(user, { page: 1 })).resolves.toEqual({
        data: [{ public: 'findMine' }],
        total: 1,
        page: 1,
        limit: 20,
      });
      await expect(controller.findMineOne(user, 'r')).resolves.toEqual({
        public: 'findMineOne',
      });

      expect(service.create).toHaveBeenCalledWith('user-1', dto);
      expect(service.findMine).toHaveBeenCalledWith('user-1', { page: 1 });
      expect(service.findMineOne).toHaveBeenCalledWith('user-1', 'r');
    });
  });

  describe('AdminRefundRequestsController', () => {
    const controller = new AdminRefundRequestsController(service as never);
    const admin = { id: 'admin-1' } as never;

    it('is protected by JwtAuthGuard and PermissionsGuard', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, AdminRefundRequestsController),
      ).toEqual([JwtAuthGuard, PermissionsGuard]);
    });

    it.each([
      ['findAll', 'refund.read'],
      ['findOne', 'refund.read'],
      ['approve', 'refund.update'],
      ['reject', 'refund.update'],
    ])('%s requires %s', (method, perm) => {
      expect(permissionsOf(method)).toEqual([perm]);
    });

    it('reads are delegated', async () => {
      await expect(controller.findAll({ page: 1 })).resolves.toEqual({
        data: [{ admin: 'findAll' }],
        total: 1,
        page: 1,
        limit: 20,
      });
      await expect(controller.findOne('r')).resolves.toEqual({
        admin: 'findOne',
      });

      expect(service.findAll).toHaveBeenCalledWith({ page: 1 });
      expect(service.findOne).toHaveBeenCalledWith('r');
    });

    it('approve/reject record the reviewing admin', async () => {
      await expect(
        controller.approve(admin, 'r', { adminNote: 'ok' } as never),
      ).resolves.toEqual({ admin: 'approve' });
      await expect(
        controller.reject(admin, 'r', { adminNote: 'no' } as never),
      ).resolves.toEqual({ admin: 'reject' });

      expect(service.approve).toHaveBeenCalledWith('r', 'admin-1', {
        adminNote: 'ok',
      });
      expect(service.reject).toHaveBeenCalledWith('r', 'admin-1', {
        adminNote: 'no',
      });
    });
  });
});
