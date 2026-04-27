// users/entity/user.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export type UserRole = 'customer' | 'admin' | 'staff';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 150 })
  full_name!: string;

  @Column({ unique: true, length: 255 })
  email!: string;

  @Column({ length: 255 })
  password!: string;

  @Column({ length: 20, nullable: true })
  phone?: string;

  @Column({ type: 'text', nullable: true })
  address?: string;

  @Column({ type: 'varchar', length: 20, default: 'customer' })
  role!: 'customer' | 'admin' | 'staff';

  @Column({ default: true })
  is_active!: boolean;

  @CreateDateColumn()
  created_at!: Date;

  @UpdateDateColumn()
  updated_at!: Date;
}