import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { User } from '@/users/entities/user.entity';
import { Product } from '@/products/entities/product.entity';

@Entity('wishlists')
@Unique(['user_id', 'product_id'])
export class Wishlist extends AbstractBaseEntity {
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
}
