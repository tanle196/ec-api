import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { Product } from './product.entity';

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
    transformer: {
      to: (v: number) => v,
      from: (v: string) => parseFloat(v),
    },
  })
  price!: number;

  @Column({ default: 0 })
  stock!: number;

  @Column({ type: 'jsonb', nullable: true })
  attributes!: Record<string, unknown> | null;

  @Column({ default: true })
  isActive!: boolean;
}
