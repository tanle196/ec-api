// permissions/entities/permission.entity.ts
import { ApiProperty } from '@nestjs/swagger';
import { Role } from '@/roles/entities/role.entity';
import { User } from '@/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { PermissionAction } from '../enums/permission-action.enum';

@Entity('permissions')
@Index(['module', 'action'], { unique: true })
export class Permission {
  @ApiProperty({
    example: 'uuid-v4',
    description: 'ID permission',
  })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

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

  @ApiProperty({
    example: '2026-01-01T10:00:00Z',
  })
  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @ApiProperty({
    example: '2026-01-01T10:05:00Z',
  })
  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;

  @ManyToMany(() => Role, (role) => role.permissions)
  roles!: Role[];

  @ManyToMany(() => User, (user) => user.permissions)
  users!: User[];
}
