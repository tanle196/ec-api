import { Identity } from '@/auth/entities/identity.entity';
import { Address } from '@/addresses/entities/address.entity';
import { Permission } from '@/permissions/entities/permission.entity';
import { Role } from '@/roles/entities/role.entity';
import { Column, Entity, JoinTable, ManyToMany, OneToMany } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';

@Entity('users')
export class User extends AbstractBaseEntity {
  @Column({ unique: true })
  email!: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  userCode!: string | null;

  @Column({ nullable: true })
  fullName!: string;

  @Column({ nullable: true })
  avatar!: string;

  @OneToMany(() => Identity, (identity) => identity.user)
  identities!: Identity[];

  @OneToMany(() => Address, (address) => address.user)
  addresses!: Address[];

  @ManyToMany(() => Role, (role) => role.users)
  @JoinTable({
    name: 'user_role',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles!: Role[];

  @ManyToMany(() => Permission, (permission) => permission.users)
  @JoinTable({
    name: 'user_permission',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions!: Permission[];
}
