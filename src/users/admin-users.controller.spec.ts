import { JwtAuthGuard } from '@/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '@/permissions/guards/permissions.guard';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminUsersController } from './admin-users.controller';

const permissionsOf = (method: string) =>
  Reflect.getMetadata(
    'permissions',
    Object.getOwnPropertyDescriptor(AdminUsersController.prototype, method)
      ?.value as object,
  ) as string[];

describe('AdminUsersController', () => {
  const buildController = () => {
    const usersService = {
      findAll: jest.fn().mockResolvedValue('findAll'),
      findByUserCode: jest.fn().mockResolvedValue('findByUserCode'),
      findByIdWithRelations: jest.fn().mockResolvedValue('detail'),
      update: jest.fn().mockResolvedValue(null),
      delete: jest.fn().mockResolvedValue(undefined),
      assignRoles: jest.fn().mockResolvedValue('assignRoles'),
      assignPermissions: jest.fn().mockResolvedValue('assignPermissions'),
    };
    return {
      controller: new AdminUsersController(usersService as never),
      usersService,
    };
  };

  it('is protected by JwtAuthGuard and PermissionsGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminUsersController)).toEqual([
      JwtAuthGuard,
      PermissionsGuard,
    ]);
  });

  it.each([
    ['findAll', 'user.read'],
    ['findByUserCode', 'user.read'],
    ['findOne', 'user.read'],
    ['update', 'user.update'],
    ['remove', 'user.delete'],
    ['assignRoles', 'user.assign.role'],
    ['assignPermissions', 'user.update'],
  ])('%s requires %s', (method, permission) => {
    expect(permissionsOf(method)).toEqual([permission]);
  });

  it('delegates list and lookup endpoints', async () => {
    const { controller, usersService } = buildController();

    await expect(controller.findAll({ page: 1 })).resolves.toBe('findAll');
    await expect(controller.findByUserCode('USR-1')).resolves.toBe(
      'findByUserCode',
    );
    await expect(controller.findOne('user-1')).resolves.toBe('detail');

    expect(usersService.findAll).toHaveBeenCalledWith({ page: 1 });
    expect(usersService.findByUserCode).toHaveBeenCalledWith('USR-1');
    expect(usersService.findByIdWithRelations).toHaveBeenCalledWith('user-1');
  });

  it('update saves then returns the refreshed detail', async () => {
    const { controller, usersService } = buildController();

    await expect(controller.update('user-1', { fullName: 'B' })).resolves.toBe(
      'detail',
    );
    expect(usersService.update).toHaveBeenCalledWith('user-1', {
      fullName: 'B',
    });
    expect(usersService.findByIdWithRelations).toHaveBeenCalledWith('user-1');
  });

  it('remove, assignRoles and assignPermissions delegate', async () => {
    const { controller, usersService } = buildController();

    await controller.remove('user-1');
    await expect(
      controller.assignRoles('user-1', { roleIds: ['r'] }),
    ).resolves.toBe('assignRoles');
    await expect(
      controller.assignPermissions('user-1', { permissionIds: ['p'] }),
    ).resolves.toBe('assignPermissions');

    expect(usersService.delete).toHaveBeenCalledWith('user-1');
    expect(usersService.assignRoles).toHaveBeenCalledWith('user-1', ['r']);
    expect(usersService.assignPermissions).toHaveBeenCalledWith('user-1', [
      'p',
    ]);
  });
});
