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

  // products
  {
    module: 'product',
    action: PermissionAction.CREATE,
    description: 'Tạo sản phẩm',
    isSystem: true,
  },
  {
    module: 'product',
    action: PermissionAction.READ,
    description: 'Xem danh sách sản phẩm',
    isSystem: true,
  },
  {
    module: 'product',
    action: PermissionAction.UPDATE,
    description: 'Cập nhật sản phẩm',
    isSystem: true,
  },
  {
    module: 'product',
    action: PermissionAction.DELETE,
    description: 'Xoá sản phẩm',
    isSystem: true,
  },
  {
    module: 'product',
    action: PermissionAction.PUBLISH,
    description: 'Xuất bản / ẩn sản phẩm',
    isSystem: true,
  },

  // orders
  {
    module: 'order',
    action: PermissionAction.READ,
    description: 'Xem danh sách đơn hàng',
    isSystem: true,
  },
  {
    module: 'order',
    action: PermissionAction.UPDATE,
    description: 'Cập nhật trạng thái đơn hàng',
    isSystem: true,
  },

  // payments
  {
    module: 'payment',
    action: PermissionAction.READ,
    description: 'Xem danh sách thanh toán',
    isSystem: true,
  },
  {
    module: 'payment',
    action: PermissionAction.UPDATE,
    description: 'Cập nhật trạng thái thanh toán',
    isSystem: true,
  },

  // reviews
  {
    module: 'review',
    action: PermissionAction.READ,
    description: 'Xem tất cả đánh giá (admin)',
    isSystem: true,
  },
  {
    module: 'review',
    action: PermissionAction.UPDATE,
    description: 'Duyệt / từ chối đánh giá',
    isSystem: true,
  },
  {
    module: 'review',
    action: PermissionAction.DELETE,
    description: 'Xoá đánh giá',
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

  // addresses
  {
    module: 'address',
    action: PermissionAction.READ,
    description: 'Xem tất cả địa chỉ (admin)',
    isSystem: true,
  },
  {
    module: 'address',
    action: PermissionAction.CREATE,
    description: 'Tạo địa chỉ cho người dùng',
    isSystem: true,
  },
  {
    module: 'address',
    action: PermissionAction.UPDATE,
    description: 'Cập nhật địa chỉ bất kỳ',
    isSystem: true,
  },
  {
    module: 'address',
    action: PermissionAction.DELETE,
    description: 'Xoá địa chỉ bất kỳ',
    isSystem: true,
  },

  // carts
  {
    module: 'cart',
    action: PermissionAction.READ,
    description: 'Xem tất cả giỏ hàng (admin)',
    isSystem: true,
  },
  {
    module: 'cart',
    action: PermissionAction.UPDATE,
    description: 'Cập nhật giỏ hàng bất kỳ',
    isSystem: true,
  },
  {
    module: 'cart',
    action: PermissionAction.DELETE,
    description: 'Xoá / xoá trắng giỏ hàng bất kỳ',
    isSystem: true,
  },

  // wishlists
  {
    module: 'wishlist',
    action: PermissionAction.READ,
    description: 'Xem tất cả wishlist (admin)',
    isSystem: true,
  },
  {
    module: 'wishlist',
    action: PermissionAction.DELETE,
    description: 'Xoá sản phẩm khỏi wishlist bất kỳ',
    isSystem: true,
  },

  // discounts
  {
    module: 'discount',
    action: PermissionAction.CREATE,
    description: 'Tạo mã giảm giá',
    isSystem: true,
  },
  {
    module: 'discount',
    action: PermissionAction.READ,
    description: 'Xem danh sách mã giảm giá',
    isSystem: true,
  },
  {
    module: 'discount',
    action: PermissionAction.UPDATE,
    description: 'Cập nhật mã giảm giá',
    isSystem: true,
  },
  {
    module: 'discount',
    action: PermissionAction.DELETE,
    description: 'Xoá mã giảm giá',
    isSystem: true,
  },

  // banners
  {
    module: 'banner',
    action: PermissionAction.CREATE,
    description: 'Tạo banner',
    isSystem: true,
  },
  {
    module: 'banner',
    action: PermissionAction.READ,
    description: 'Xem tất cả banner (admin)',
    isSystem: true,
  },
  {
    module: 'banner',
    action: PermissionAction.UPDATE,
    description: 'Cập nhật / sắp xếp banner',
    isSystem: true,
  },
  {
    module: 'banner',
    action: PermissionAction.DELETE,
    description: 'Xoá banner',
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
