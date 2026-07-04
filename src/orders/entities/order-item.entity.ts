import { ProductVariant } from '@/products/entities/product-variant.entity';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractIdEntity } from '@/common/entities/base.entity';
import { Order } from './order.entity';

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

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  unitPrice!: number;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  total!: number;
}
