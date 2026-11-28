import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractIdEntity } from '@/common/entities/base.entity';
import { moneyTransformer } from '@/common/utils/money.util';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { StockReceipt } from './stock-receipt.entity';

@Entity('stock_receipt_items')
export class StockReceiptItem extends AbstractIdEntity {
  @Column({ type: 'uuid' })
  receipt_id!: string;

  @ManyToOne(() => StockReceipt, (r) => r.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'receipt_id' })
  receipt!: StockReceipt;

  @Column({ type: 'uuid', nullable: true })
  variant_id!: string | null;

  @ManyToOne(() => ProductVariant, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'variant_id' })
  variant!: ProductVariant | null;

  @Column()
  sku!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: moneyTransformer,
  })
  unitCost!: number;
}
