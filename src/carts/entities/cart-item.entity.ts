import { ProductVariant } from '@/products/entities/product-variant.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { Cart } from './cart.entity';

@Entity('cart_items')
export class CartItem extends AbstractBaseEntity {
  @Column({ type: 'uuid' })
  cart_id!: string;

  @ManyToOne(() => Cart, (c) => c.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'cart_id' })
  cart!: Cart;

  @Column({ type: 'uuid' })
  variant_id!: string;

  @ManyToOne(() => ProductVariant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'variant_id' })
  variant!: ProductVariant;

  @Column({ type: 'int', default: 1 })
  quantity!: number;
}
