import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
} from 'typeorm';
import { AbstractIdEntity } from '@/common/entities/base.entity';
import { ShipmentEventSource } from '../enums/shipment-event-source.enum';
import { ShipmentStatus } from '../enums/shipment-status.enum';
import { Shipment } from './shipment.entity';

// Tracking history: every status a shipment went through, and who said so.
@Entity('shipment_events')
export class ShipmentEvent extends AbstractIdEntity {
  @Column({ type: 'uuid' })
  shipment_id!: string;

  @ManyToOne(() => Shipment, (s) => s.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shipment_id' })
  shipment!: Shipment;

  @Column({
    type: 'enum',
    enum: ShipmentStatus,
    enumName: 'shipment_status_enum',
  })
  status!: ShipmentStatus;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  // When it happened (carriers report this; may be before createdAt).
  @Column({ type: 'timestamptz' })
  occurredAt!: Date;

  @Column({
    type: 'enum',
    enum: ShipmentEventSource,
    enumName: 'shipment_event_source_enum',
  })
  source!: ShipmentEventSource;

  @Column({ type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  raw!: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
