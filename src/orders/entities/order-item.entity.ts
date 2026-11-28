import { ProductVariant } from '@/products/entities/product-variant.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractIdEntity } from '@/common/entities/base.entity';
import { Order } from './order.entity';
import { moneyTransformer } from '@/common/utils/money.util';

@Entity('order_items')
export class OrderItem extends AbstractIdEntity {
  @Column({ type: 'uuid' })
  order_id!: string;

  @ManyToOne(() => Order, (o) => o.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ type: 'uuid', nullable: true })
  variant_id!: string | null;

  @ManyToOne(() => ProductVariant, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'variant_id' })
  variant!: ProductVariant | null;

  @Column()
  productName!: string;

  @Column({ type: 'varchar', nullable: true })
  variantName!: string | null;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: moneyTransformer,
  })
  unitPrice!: number;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: moneyTransformer,
  })
  total!: number;

  // Share of the order's discount taken off this line. Lines outside a
  // scoped code's reach get 0.
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: moneyTransformer,
  })
  discountAmount!: number;

  // Share of the order's shipping fee carried by this line.
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: moneyTransformer,
  })
  shippingAmount!: number;

  // What the customer actually paid for this line:
  // total - discountAmount + shippingAmount. Summed over an order's lines it
  // equals order.total exactly, so refunds can be computed per line.
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: moneyTransformer,
  })
  paidAmount!: number;

  // Variant's average cost when the line shipped (for gross margin). Null
  // until shipped, or when the variant had no cost recorded yet.
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: moneyTransformer,
  })
  unitCost!: number | null;
}
