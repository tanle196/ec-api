import { User } from '@/users/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';

@Entity('addresses')
export class Address extends AbstractBaseEntity {
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
}
