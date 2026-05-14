import { User } from '@/users/entities/user.entity';
import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('addresses')
export class Address {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, (user) => user.addresses, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column()
  fullName!: string;

  @Column()
  phone!: string;

  @Column()
  addressLine1!: string;

  @Column({ type: 'varchar', nullable: true })
  addressLine2!: string | null;

  @Column()
  city!: string;

  @Column()
  province!: string;

  @Column({ default: 'VN' })
  country!: string;

  @Column({ type: 'varchar', nullable: true })
  postalCode!: string | null;

  @Column({ default: false })
  isDefault!: boolean;

  @CreateDateColumn({ type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamp' })
  updatedAt!: Date;
}
