import { Identity } from '@/auth/entities/identity.entity';
import { Address } from '@/addresses/entities/address.entity';
import { Permission } from '@/permissions/entities/permission.entity';
import { Role } from '@/roles/entities/role.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column({ type: 'varchar', unique: true, nullable: true })
  userCode!: string | null;

  @Column({ nullable: true })
  fullName!: string;

  @Column({ nullable: true })
  avatar!: string;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;

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
