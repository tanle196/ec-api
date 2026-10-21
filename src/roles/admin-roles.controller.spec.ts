import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminRolesController } from './admin-roles.controller';
import { RoleMapper } from './mapper/role.mapper';

const permissionsOf = (method: string) =>
  Reflect.getMetadata(
    'permissions',
    Object.getOwnPropertyDescriptor(AdminRolesController.prototype, method)
      ?.value as object,
  ) as string[];

describe('AdminRolesController', () => {
  const rolesService = {
    create: jest.fn().mockResolvedValue('create'),
    findAll: jest.fn().mockResolvedValue('findAll'),
    findOne: jest.fn().mockResolvedValue('findOne'),
    update: jest.fn().mockResolvedValue('update'),
    remove: jest.fn().mockResolvedValue('remove'),
    assignPermissions: jest.fn().mockResolvedValue('assignPermissions'),
  };
  const controller = new AdminRolesController(rolesService as never);

  beforeAll(() => {
    jest
      .spyOn(RoleMapper, 'toResponse')
      .mockImplementation((r) => ({ mapped: r }) as never);
  });

  // findAll is already mapped by the service; remove returns a plain result.
  const unmapped = new Set(['findAll', 'remove']);

  it('is protected by JwtAuthGuard and PermissionsGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminRolesController)).toEqual([
      JwtAuthGuard,
      PermissionsGuard,
    ]);
  });

  it.each([
    ['createRole', 'role.create', [{ name: 'x' }], 'create', [{ name: 'x' }]],
    ['findAll', 'role.read', [{ page: 1 }], 'findAll', [{ page: 1 }]],
    ['findOne', 'role.read', ['id'], 'findOne', ['id']],
    [
      'update',
      'role.update',
      ['id', { name: 'y' }],
      'update',
      ['id', { name: 'y' }],
    ],
    ['remove', 'role.delete', ['id'], 'remove', ['id']],
    [
      'assignPermissions',
      'role.update',
      ['id', { permissionIds: ['p'] }],
      'assignPermissions',
      ['id', ['p']],
    ],
  ] as const)(
    '%s requires %s and delegates to service.%s',
    async (method, permission, args, serviceMethod, serviceArgs) => {
      expect(permissionsOf(method)).toEqual([permission]);

      const result = await (
        controller[method] as (...a: unknown[]) => Promise<unknown>
      )(...args);

      expect(result).toEqual(
        unmapped.has(serviceMethod) ? serviceMethod : { mapped: serviceMethod },
      );
      expect(rolesService[serviceMethod]).toHaveBeenCalledWith(...serviceArgs);
    },
  );
});
