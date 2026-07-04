// permissions/entities/permission.entity.ts
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@/roles/entities/role.entity';
import { User } from '@/users/entities/user.entity';
import { Column, Entity, Index, ManyToMany } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { PermissionAction } from '../enums/permission-action.enum';

@Entity('permissions')
@Index(['module', 'action'], { unique: true })
export class Permission extends AbstractBaseEntity {
  @ApiProperty({
    example: 'user',
    description: 'Module',
  })
  @Column({ length: 50 })
  module!: string;

  @ApiProperty({
    example: PermissionAction.READ,
    enum: PermissionAction,
    description: 'Hành động CRUD',
  })
  @Column({
    type: 'enum',
    enum: PermissionAction,
    enumName: 'permission_action_enum',
  })
  action!: PermissionAction;

  @ApiProperty({
    example: 'Xem danh sách người dùng',
    required: false,
  })
  @Column({ nullable: false })
  description!: string;

  @ApiProperty({
    example: false,
    description: 'Permission hệ thống (readonly)',
  })
  @Column({ default: false })
  isSystem!: boolean;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles!: Role[];

  @ManyToMany(() => User, (user) => user.permissions)
  users!: User[];
}
