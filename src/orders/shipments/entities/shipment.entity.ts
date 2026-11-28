import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { moneyTransformer } from '@/common/utils/money.util';
import { Order } from '../../entities/order.entity';
import { ShipmentStatus } from '../enums/shipment-status.enum';
import { ShipmentEvent } from './shipment-event.entity';

/**
 * A parcel sent for an order. Its status drives the order's shipping
 * statuses (shipped / delivered / delivery_failed / returned_to_sender).
 * An order has at most one shipment that is still moving; the table allows
 * several so a returned order's history is kept and split shipments can
 * come later.
 */
@Entity('shipments')
@Index('UQ_shipments_active_order', ['order_id'], {
  unique: true,
  where: `"status" IN ('in_transit', 'delivery_failed', 'returning')`,
})
export class Shipment extends AbstractBaseEntity {
  @Column({ type: 'uuid' })
  order_id!: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({
    type: 'enum',
    enum: ShipmentStatus,
    enumName: 'shipment_status_enum',
    default: ShipmentStatus.IN_TRANSIT,
  })
  status!: ShipmentStatus;

  // e.g. "GHN", "GHTK", or "manual" for staff delivery.
  @Column()
  carrier!: string;

  @Column({ type: 'varchar', nullable: true })
  trackingNumber!: string | null;

  // What the carrier charges the shop (vs. order.shippingFee, what the
  // customer paid). Null for manual deliveries.
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: moneyTransformer,
  })
  carrierFee!: number | null;

  @Column({ type: 'timestamptz', nullable: true })
  expectedDeliveryAt!: Date | null;

  // Delivery attempts made (1 on hand-over, +1 per re-attempt).
  @Column({ type: 'int', default: 1 })
  attempts!: number;

  @Column({ type: 'timestamptz' })
  shippedAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  returnedAt!: Date | null;

  @OneToMany(() => ShipmentEvent, (e) => e.shipment)
  events!: ShipmentEvent[];
}
