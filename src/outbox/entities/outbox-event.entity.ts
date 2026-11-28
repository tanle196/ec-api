import { Column, CreateDateColumn, Entity, Index } from 'typeorm';
import { AbstractIdEntity } from '@/common/entities/base.entity';
import { OutboxEventStatus } from '../enums/outbox-event-status.enum';

/**
 * A side effect to run after a state change commits (send an email,
 * refund a returned order...). Written in the same transaction as the
 * change, so it exists if and only if the change does; the dispatcher then
 * runs it at least once, retrying with backoff. Handlers must therefore be
 * idempotent.
 */
@Entity('outbox_events')
@Index('IDX_outbox_events_status_available', ['status', 'availableAt'])
export class OutboxEvent extends AbstractIdEntity {
  @Column()
  type!: string;

  // What the event is about, e.g. ('order', <order id>).
  @Column()
  aggregateType!: string;

  @Column({ type: 'uuid' })
  aggregateId!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({
    type: 'enum',
    enum: OutboxEventStatus,
    enumName: 'outbox_event_status_enum',
    default: OutboxEventStatus.PENDING,
  })
  status!: OutboxEventStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  // Not picked up before this time: retry backoff, or the lease held by
  // the dispatcher run currently handling it.
  @Column({ type: 'timestamptz', default: () => 'now()' })
  availableAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
