import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminPaymentsController } from './admin-payments.controller';
import { PaymentsController } from './payments.controller';

const permissionsOf = (method: string) =>
  Reflect.getMetadata(
    'permissions',
    Object.getOwnPropertyDescriptor(AdminPaymentsController.prototype, method)
      ?.value as object,
  ) as string[];

describe('Payment controllers', () => {
  const service = {
    create: jest.fn().mockResolvedValue('create'),
    findAll: jest.fn().mockResolvedValue('findAll'),
    findOne: jest.fn().mockResolvedValue('findOne'),
    updateStatus: jest.fn().mockResolvedValue('updateStatus'),
    createRefund: jest.fn().mockResolvedValue('createRefund'),
    findRefunds: jest.fn().mockResolvedValue('findRefunds'),
  };
  const user = { id: 'user-1' } as never;

  beforeEach(() => jest.clearAllMocks());

  describe('PaymentsController', () => {
    const controller = new PaymentsController(service as never);

    it('is protected by JwtAuthGuard', () => {
      expect(Reflect.getMetadata(GUARDS_METADATA, PaymentsController)).toEqual([
        JwtAuthGuard,
      ]);
    });

    it('scopes every call to the current user', async () => {
      const dto = { order_id: 'o' };

      await expect(controller.create(user, dto as never)).resolves.toBe(
        'create',
      );
      await controller.findMine(user, { page: 1 });
      await controller.findMineOne(user, 'p');

      expect(service.create).toHaveBeenCalledWith('user-1', dto);
      expect(service.findAll).toHaveBeenCalledWith(
        { page: 1 },
        'user-1',
        false,
      );
      expect(service.findOne).toHaveBeenCalledWith('p', 'user-1');
    });
  });

  describe('AdminPaymentsController', () => {
    const controller = new AdminPaymentsController(service as never);
    const admin = { id: 'admin-1' } as never;

    it('is protected by JwtAuthGuard and PermissionsGuard', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, AdminPaymentsController),
      ).toEqual([JwtAuthGuard, PermissionsGuard]);
    });

    it.each([
      ['findAll', 'payment.read'],
      ['findOne', 'payment.read'],
      ['updateStatus', 'payment.update'],
      ['createRefund', 'payment.update'],
      ['findRefunds', 'payment.read'],
    ])('%s requires %s', (method, perm) => {
      expect(permissionsOf(method)).toEqual([perm]);
    });

    it('lists and reads payments as admin', async () => {
      await controller.findAll({ page: 1 });
      await controller.findOne('p');
      await controller.findRefunds('p');

      expect(service.findAll).toHaveBeenCalledWith(
        { page: 1 },
        undefined,
        true,
      );
      expect(service.findOne).toHaveBeenCalledWith('p');
      expect(service.findRefunds).toHaveBeenCalledWith('p');
    });

    it('passes the admin id as actor for writes', async () => {
      const statusDto = { status: 'completed' };
      const refundDto = { amount: 10 };

      await controller.updateStatus(admin, 'p', statusDto as never);
      await controller.createRefund(admin, 'p', refundDto as never);

      expect(service.updateStatus).toHaveBeenCalledWith(
        'p',
        statusDto,
        'admin-1',
      );
      expect(service.createRefund).toHaveBeenCalledWith(
        'p',
        refundDto,
        'admin-1',
      );
    });
  });
});
