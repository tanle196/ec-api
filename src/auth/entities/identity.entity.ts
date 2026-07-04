import { User } from '@/users/entities/user.entity';
import { Column, Entity, ManyToOne, Unique } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { AuthProvider } from '../enums/AuthProvider';

@Entity('identities')
@Unique(['provider', 'providerUserId'])
export class Identity extends AbstractBaseEntity {
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

  @ManyToOne(() => User, (user) => user.identities, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  user!: User;
}
