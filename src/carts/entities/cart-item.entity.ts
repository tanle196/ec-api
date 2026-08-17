import { ProductVariant } from '@/products/entities/product-variant.entity';
import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { Cart } from './cart.entity';

// One row per (cart, variant): addItem() upserts into this pair rather than
// inserting a fresh row, so a variant already in the cart always has its
// quantity merged instead of appearing as a second line item.
@Entity('cart_items')
@Unique('UQ_cart_items_cart_id_variant_id', ['cart_id', 'variant_id'])
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
