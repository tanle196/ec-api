import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Product } from './product.entity';

@Entity('product_images')
export class ProductImage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid' })
  product_id!: string;

  @ManyToOne(() => Product, (p) => p.images, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'product_id' })
  product!: Product;

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
