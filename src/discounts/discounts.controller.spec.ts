import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminDiscountsController } from './admin-discounts.controller';
import { DiscountsController } from './discounts.controller';

const permissionsOf = (method: string) =>
  Reflect.getMetadata(
    'permissions',
    Object.getOwnPropertyDescriptor(AdminDiscountsController.prototype, method)
      ?.value as object,
  ) as string[];

describe('Discount controllers', () => {
  const service = {
    validate: jest.fn().mockResolvedValue('validate'),
    create: jest.fn().mockResolvedValue('create'),
    findAll: jest.fn().mockResolvedValue('findAll'),
    findOne: jest.fn().mockResolvedValue('findOne'),
    update: jest.fn().mockResolvedValue('update'),
    remove: jest.fn().mockResolvedValue('remove'),
  };

  it('DiscountsController requires auth and delegates validate', async () => {
    const controller = new DiscountsController(service as never);
    const dto = { code: 'SALE10', subtotal: 100 };

    expect(Reflect.getMetadata(GUARDS_METADATA, DiscountsController)).toEqual([
      JwtAuthGuard,
    ]);
    await expect(controller.validate(dto)).resolves.toBe('validate');
    expect(service.validate).toHaveBeenCalledWith(dto);
  });

  describe('AdminDiscountsController', () => {
    const controller = new AdminDiscountsController(service as never);

    it('is protected by JwtAuthGuard and PermissionsGuard', () => {
      expect(
        Reflect.getMetadata(GUARDS_METADATA, AdminDiscountsController),
      ).toEqual([JwtAuthGuard, PermissionsGuard]);
    });

    it.each([
      ['create', 'discount.create', [{ code: 'X' }]],
      ['findAll', 'discount.read', [{ page: 1 }]],
      ['findOne', 'discount.read', ['d-1']],
      ['update', 'discount.update', ['d-1', { isActive: false }]],
      ['remove', 'discount.delete', ['d-1']],
    ] as const)('%s requires %s and delegates', async (method, perm, args) => {
      expect(permissionsOf(method)).toEqual([perm]);
      await expect(
        (controller[method] as (...a: unknown[]) => Promise<unknown>)(...args),
      ).resolves.toBe(method);
      expect(service[method]).toHaveBeenCalledWith(...args);
    });
  });
});
