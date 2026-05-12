import { DataSource } from 'typeorm';
import { Permission } from '@/permissions/entities/permission.entity';
import { PermissionAction } from '@/permissions/enums/permission-action.enum';

const PERMISSIONS: Pick<
  Permission,
  'module' | 'action' | 'description' | 'isSystem'
>[] = [
  // users
  {
    module: 'user',
    action: PermissionAction.CREATE,
    description: 'Tạo người dùng',
    isSystem: true,
  },
  {
    module: 'user',
    action: PermissionAction.READ,
    description: 'Xem danh sách người dùng',
    isSystem: true,
  },
  {
    module: 'user',
    action: PermissionAction.UPDATE,
    description: 'Cập nhật người dùng',
    isSystem: true,
  },
  {
    module: 'user',
    action: PermissionAction.DELETE,
    description: 'Xoá người dùng',
    isSystem: true,
  },
  {
    module: 'user',
    action: PermissionAction.ASSIGN_ROLE,
    description: 'Gán role cho người dùng',
    isSystem: true,
  },

  // roles
  {
    module: 'role',
    action: PermissionAction.CREATE,
    description: 'Tạo role',
    isSystem: true,
  },
  {
    module: 'role',
    action: PermissionAction.READ,
    description: 'Xem danh sách role',
    isSystem: true,
  },
  {
    module: 'role',
    action: PermissionAction.UPDATE,
    description: 'Cập nhật role',
    isSystem: true,
  },
  {
    module: 'role',
    action: PermissionAction.DELETE,
    description: 'Xoá role',
    isSystem: true,
  },

  // categories
  {
    module: 'category',
    action: PermissionAction.CREATE,
    description: 'Tạo danh mục',
    isSystem: true,
  },
  {
    module: 'category',
    action: PermissionAction.READ,
    description: 'Xem danh sách danh mục',
    isSystem: true,
  },
  {
    module: 'category',
    action: PermissionAction.UPDATE,
    description: 'Cập nhật danh mục',
    isSystem: true,
  },
  {
    module: 'category',
    action: PermissionAction.DELETE,
    description: 'Xoá danh mục',
    isSystem: true,
  },

  // permissions
  {
    module: 'permission',
    action: PermissionAction.CREATE,
    description: 'Tạo permission',
    isSystem: true,
  },
  {
    module: 'permission',
    action: PermissionAction.READ,
    description: 'Xem danh sách permission',
    isSystem: true,
  },
  {
    module: 'permission',
    action: PermissionAction.UPDATE,
    description: 'Cập nhật permission',
    isSystem: true,
  },
  {
    module: 'permission',
    action: PermissionAction.DELETE,
    description: 'Xoá permission',
    isSystem: true,
  },
];

export async function seedPermissions(
  dataSource: DataSource,
): Promise<Permission[]> {
  const repo = dataSource.getRepository(Permission);

  const permissions: Permission[] = [];

  for (const data of PERMISSIONS) {
    let permission = await repo.findOne({
      where: { module: data.module, action: data.action },
    });

    if (!permission) {
      permission = repo.create(data);
      await repo.save(permission);
      console.log(`  [+] Permission: ${data.module}:${data.action}`);
    } else {
      console.log(`  [~] Permission exists: ${data.module}:${data.action}`);
    }

    permissions.push(permission);
  }

  return permissions;
}
