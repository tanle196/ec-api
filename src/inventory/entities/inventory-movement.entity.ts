import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { AbstractIdEntity } from '@/common/entities/base.entity';
import { ProductVariant } from '@/products/entities/product-variant.entity';
import { InventoryMovementReason } from '../enums/inventory-movement-reason.enum';

/**
 * Append-only stock ledger. Every change to a variant's `stock`/`reserved`
 * writes one row here in the same transaction, so for every variant:
 *
 *   SUM(onHandDelta)   = stock + reserved   (units physically in the warehouse)
 *   SUM(reservedDelta) = reserved           (units held for unshipped orders)
 *
 * `InventoryAuditService` checks exactly that. Rows are never updated or
 * deleted; a mistake is corrected by a new ADJUSTMENT row.
 */
@Entity('inventory_movements')
@Index('IDX_inventory_movements_variant_created', ['variant_id', 'createdAt'])
@Index('IDX_inventory_movements_ref', ['refType', 'refId'])
export class InventoryMovement extends AbstractIdEntity {
  // Null once the variant is deleted; `sku` keeps the history readable.
  @Column({ type: 'uuid', nullable: true })
  variant_id!: string | null;

  @ManyToOne(() => ProductVariant, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'variant_id' })
  variant!: ProductVariant | null;

  @Column()
  sku!: string;

  @Column({ type: 'enum', enum: InventoryMovementReason })
  reason!: InventoryMovementReason;

  @Column({ type: 'int' })
  onHandDelta!: number;

  @Column({ type: 'int' })
  reservedDelta!: number;

  // What caused it, e.g. ('order', <order id>) or ('stock_receipt', <id>).
  @Column({ type: 'varchar', nullable: true })
  refType!: string | null;

  @Column({ type: 'uuid', nullable: true })
  refId!: string | null;

  // Staff member for manual movements; null for customer/system ones.
  @Column({ type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
