import { Column, Entity, Index } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { CarrierWebhookStatus } from '../enums/carrier-webhook-status.enum';

// Every carrier status callback, kept for deduplication and so updates we
// couldn't apply (unknown parcel, unmapped status, impossible move) stay
// visible.
@Entity('carrier_webhook_events')
@Index('UQ_carrier_webhook_events_key', ['carrier', 'eventKey'], {
  unique: true,
})
@Index('IDX_carrier_webhook_events_status', ['status', 'createdAt'])
export class CarrierWebhookEvent extends AbstractBaseEntity {
  @Column()
  carrier!: string;

  @Column()
  eventKey!: string;

  @Column({ type: 'varchar', nullable: true })
  trackingNumber!: string | null;

  @Column({ type: 'varchar', nullable: true })
  carrierStatus!: string | null;

  @Column({ type: 'uuid', nullable: true })
  shipment_id!: string | null;

  @Column({
    type: 'enum',
    enum: CarrierWebhookStatus,
    enumName: 'carrier_webhook_status_enum',
    default: CarrierWebhookStatus.RECEIVED,
  })
  status!: CarrierWebhookStatus;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'text', nullable: true })
  errorMessage!: string | null;
}
