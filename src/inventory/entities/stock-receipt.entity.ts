import { Column, Entity, OneToMany } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { moneyTransformer } from '@/common/utils/money.util';
import { StockReceiptStatus } from '../enums/stock-receipt-status.enum';
import { StockReceiptItem } from './stock-receipt-item.entity';

// Goods-received note (phiếu nhập kho). Editable while DRAFT; confirming it
// adds the stock and updates each variant's average cost.
@Entity('stock_receipts')
export class StockReceipt extends AbstractBaseEntity {
  @Column({ unique: true })
  code!: string;

  @Column({ type: 'varchar', nullable: true })
  supplier!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @Column({
    type: 'enum',
    enum: StockReceiptStatus,
    default: StockReceiptStatus.DRAFT,
  })
  status!: StockReceiptStatus;

  @Column({
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
    transformer: moneyTransformer,
  })
  totalCost!: number;

  @Column({ type: 'uuid' })
  createdBy!: string;

  @Column({ type: 'uuid', nullable: true })
  confirmedBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt!: Date | null;

  @OneToMany(() => StockReceiptItem, (i) => i.receipt, { cascade: true })
  items!: StockReceiptItem[];
}
