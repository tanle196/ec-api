import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { Product } from './product.entity';
import { moneyTransformer } from '@/common/utils/money.util';

@Entity('product_variants')
export class ProductVariant extends AbstractBaseEntity {
  @Column({ type: 'uuid' })
  product_id!: string;

  @ManyToOne(() => Product, (p) => p.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column()
  name!: string;

  @Column({ unique: true })
  sku!: string;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: moneyTransformer,
  })
  price!: number;

  // Units available to sell (on hand minus reserved). Every reader that
  // asks "can I sell N?" uses this. Only InventoryService writes it, so each
  // change has a matching inventory_movements row.
  @Column({ default: 0 })
  stock!: number;

  // Units held for orders that are placed but not shipped yet. Physically
  // in the warehouse: on hand = stock + reserved.
  @Column({ type: 'int', default: 0 })
  reserved!: number;

  // Flag the variant as low on stock when `stock` drops to this (null = off).
  @Column({ type: 'int', nullable: true })
  lowStockThreshold!: number | null;

  // Weighted average purchase cost, updated by each confirmed stock
  // receipt. Null until the first receipt.
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: moneyTransformer,
  })
  avgCost!: number | null;

  @Column({ type: 'jsonb', nullable: true })
  attributes!: Record<string, unknown> | null;

  @Column({ default: true })
  isActive!: boolean;
}
