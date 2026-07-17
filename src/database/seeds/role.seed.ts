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
      // users
      { module: 'user', action: 'create' },
      { module: 'user', action: 'read' },
      { module: 'user', action: 'update' },
      { module: 'user', action: 'delete' },
      { module: 'user', action: 'assign.role' },
      // roles & permissions: chỉ xem, không được tạo/sửa/xoá (dành riêng cho super-admin)
      { module: 'role', action: 'read' },
      { module: 'permission', action: 'read' },
      // categories
      { module: 'category', action: 'create' },
      { module: 'category', action: 'read' },
      { module: 'category', action: 'update' },
      { module: 'category', action: 'delete' },
      // products
      { module: 'product', action: 'create' },
      { module: 'product', action: 'read' },
      { module: 'product', action: 'update' },
      { module: 'product', action: 'delete' },
      { module: 'product', action: 'publish' },
      // orders
      { module: 'order', action: 'read' },
      { module: 'order', action: 'update' },
      // payments
      { module: 'payment', action: 'read' },
      { module: 'payment', action: 'update' },
      // reviews
      { module: 'review', action: 'read' },
      { module: 'review', action: 'update' },
      { module: 'review', action: 'delete' },
      // addresses
      { module: 'address', action: 'read' },
      { module: 'address', action: 'create' },
      { module: 'address', action: 'update' },
      { module: 'address', action: 'delete' },
      // carts
      { module: 'cart', action: 'read' },
      { module: 'cart', action: 'update' },
      { module: 'cart', action: 'delete' },
      // wishlists
      { module: 'wishlist', action: 'read' },
      { module: 'wishlist', action: 'delete' },
      // discounts
      { module: 'discount', action: 'create' },
      { module: 'discount', action: 'read' },
      { module: 'discount', action: 'update' },
      { module: 'discount', action: 'delete' },
      // banners
      { module: 'banner', action: 'create' },
      { module: 'banner', action: 'read' },
      { module: 'banner', action: 'update' },
      { module: 'banner', action: 'delete' },
      // media
      { module: 'media', action: 'upload' },
      { module: 'media', action: 'delete' },
    ],
  },
  {
    name: 'member',
    description: 'Thành viên thông thường',
    permissionKeys: [{ module: 'user', action: 'read' }],
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
              // eslint-disable-next-line @typescript-eslint/no-unsafe-enum-comparison
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
      console.log(
        `  [+] Role: ${data.name} (${assignedPermissions.length} permissions)`,
      );
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
