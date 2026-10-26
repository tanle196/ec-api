import { Permission } from '@/permissions/entities/permission.entity';
import { User } from '@/users/entities/user.entity';
import { Column, Entity, JoinTable, ManyToMany } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';

@Entity('roles')
export class Role extends AbstractBaseEntity {
  @Column({ unique: true })
  name!: string;

  @Column({ nullable: true })
  description!: string;

  @ManyToMany(() => User, (user) => user.roles)
  users!: User[];

  @ManyToMany(() => Permission, (permission) => permission.roles)
  @JoinTable({
    name: 'role_permission',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions!: Permission[];
}
