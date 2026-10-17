import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminPermissionsController } from './admin-permissions.controller';
import { PermissionsGuard } from './guards/permissions.guard';

const permissionsOf = (method: string) =>
  Reflect.getMetadata(
    'permissions',
    Object.getOwnPropertyDescriptor(
      AdminPermissionsController.prototype,
      method,
    )?.value as object,
  ) as string[];

describe('AdminPermissionsController', () => {
  const service = {
    create: jest.fn().mockResolvedValue('create'),
    getMeta: jest.fn().mockResolvedValue('getMeta'),
    findAll: jest.fn().mockResolvedValue('findAll'),
    findAllRaw: jest.fn().mockResolvedValue('findAllRaw'),
    findOne: jest.fn().mockResolvedValue('findOne'),
    update: jest.fn().mockResolvedValue('update'),
    remove: jest.fn().mockResolvedValue('remove'),
  };
  const controller = new AdminPermissionsController(service as never);

  it('is protected by JwtAuthGuard and PermissionsGuard', () => {
    expect(
      Reflect.getMetadata(GUARDS_METADATA, AdminPermissionsController),
    ).toEqual([JwtAuthGuard, PermissionsGuard]);
  });

  it.each([
    ['create', 'permission.create', [{ module: 'm' }]],
    ['getMeta', 'permission.read', []],
    ['findAll', 'permission.read', [{ page: 1 }]],
    ['findAllRaw', 'permission.read', []],
    ['findOne', 'permission.read', ['id']],
    ['update', 'permission.update', ['id', { description: 'd' }]],
    ['remove', 'permission.delete', ['id']],
  ] as const)('%s requires %s and delegates', async (method, perm, args) => {
    expect(permissionsOf(method)).toEqual([perm]);

    const result = await (
      controller[method] as (...a: unknown[]) => Promise<unknown>
    )(...args);

    expect(result).toBe(method);
    expect(service[method]).toHaveBeenCalledWith(...args);
  });
});
