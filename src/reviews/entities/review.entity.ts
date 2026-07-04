import { Product } from '@/products/entities/product.entity';
import { User } from '@/users/entities/user.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';

@Entity('reviews')
@Unique(['user_id', 'product_id'])
export class Review extends AbstractBaseEntity {
  @Column({ type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid' })
  product_id!: string;

  @ManyToOne(() => Product, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ type: 'int' })
  rating!: number;

  @Column({ type: 'varchar', nullable: true })
  title!: string | null;

  @Column({ type: 'text', nullable: true })
  content!: string | null;

  @Column({ default: false })
  isVerified!: boolean;

  @Column({ default: false })
  isApproved!: boolean;
}
