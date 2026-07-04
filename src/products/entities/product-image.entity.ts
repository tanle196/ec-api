import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractIdEntity } from '@/common/entities/base.entity';
import { Product } from './product.entity';
import { ProductVariant } from './product-variant.entity';

@Entity('product_images')
export class ProductImage extends AbstractIdEntity {
  @Column({ type: 'uuid' })
  product_id!: string;

  @ManyToOne(() => Product, (p) => p.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

  @Column({ type: 'uuid', nullable: true })
  variant_id!: string | null;

  @ManyToOne(() => ProductVariant, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'variant_id' })
  variant!: ProductVariant | null;

  @Column()
  url!: string;

  @Column({ type: 'varchar', nullable: true })
  publicId!: string | null;

  @Column({ type: 'varchar', nullable: true })
  alt!: string | null;

  @Column({ default: false })
  isPrimary!: boolean;

  @Column({ default: 0 })
  sortOrder!: number;
}
