import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { PaymentMethod } from '../enums/payment-method.enum';
import { WebhookProcessingStatus } from '../enums/webhook-processing-status.enum';
import { Payment } from './payment.entity';

@Entity('payment_webhook_events')
export class PaymentWebhookEvent extends AbstractBaseEntity {
  @Column({ type: 'enum', enum: PaymentMethod })
  provider!: PaymentMethod;

  @Column({ type: 'varchar' })
  eventId!: string;

  @Column({ type: 'uuid', nullable: true })
  payment_id!: string | null;

  @ManyToOne(() => Payment, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'payment_id' })
  payment!: Payment | null;

  @Column({
    type: 'enum',
    enum: WebhookProcessingStatus,
    default: WebhookProcessingStatus.RECEIVED,
  })
  status!: WebhookProcessingStatus;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'varchar', nullable: true })
  errorMessage!: string | null;
}
