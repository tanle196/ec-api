import { User } from '@/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { AuthProvider } from '../enums/AuthProvider';

@Entity('identities')
@Unique(['provider', 'providerUserId'])
export class Identity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ nullable: true })
  providerUserId!: string;

  @Column({ type: 'enum', enum: AuthProvider })
  provider!: AuthProvider;

  @Column({ nullable: true })
  passwordHash!: string;

  @Column({ default: false })
  isActive!: boolean;

  @Column({ type: 'text', nullable: true })
  accessToken!: string | null;

  @Column({ type: 'text', nullable: true })
  refreshToken!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  verificationToken!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  verificationTokenExpires!: Date | null;

  @Column({ type: 'text', nullable: true })
  resetToken!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resetTokenExpires!: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  rawProfile: any;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;

  @ManyToOne(() => User, (user) => user.identities, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  user!: User;
}
