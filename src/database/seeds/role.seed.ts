import { DataSource } from 'typeorm';
import { Role } from '@/roles/entities/role.entity';
import { Permission } from '@/permissions/entities/permission.entity';

interface RoleSeedData {
  name: string;
  description: string;
  permissionKeys: { module: string; action: string }[];
}

const ROLES: RoleSeedData[] = [
  {
    name: 'super-admin',
    description: 'Toàn quyền hệ thống',
    permissionKeys: [], // sẽ gán tất cả permissions
  },
  {
    name: 'admin',
    description: 'Quản trị viên',
    permissionKeys: [
      { module: 'user', action: 'create' },
      { module: 'user', action: 'read' },
      { module: 'user', action: 'update' },
      { module: 'user', action: 'delete' },
      { module: 'user', action: 'assign.role' },
      { module: 'role', action: 'read' },
      { module: 'permission', action: 'read' },
    ],
  },
  {
    name: 'member',
    description: 'Thành viên thông thường',
    permissionKeys: [
      { module: 'user', action: 'read' },
    ],
  },
];

export async function seedRoles(
  dataSource: DataSource,
  allPermissions: Permission[],
): Promise<Role[]> {
  const roleRepo = dataSource.getRepository(Role);

  const roles: Role[] = [];

  for (const data of ROLES) {
    let role = await roleRepo.findOne({
      where: { name: data.name },
      relations: ['permissions'],
    });

    const assignedPermissions =
      data.name === 'super-admin'
        ? allPermissions
        : allPermissions.filter((p) =>
            data.permissionKeys.some(
              (k) => k.module === p.module && k.action === p.action,
            ),
          );

    if (!role) {
      role = roleRepo.create({
        name: data.name,
        description: data.description,
        permissions: assignedPermissions,
      });
      await roleRepo.save(role);
      console.log(`  [+] Role: ${data.name} (${assignedPermissions.length} permissions)`);
    } else {
      role.description = data.description;
      role.permissions = assignedPermissions;
      await roleRepo.save(role);
      console.log(`  [~] Role updated: ${data.name}`);
    }

    roles.push(role);
  }

  return roles;
}
