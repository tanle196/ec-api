import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { Order } from '@/orders/entities/order.entity';
import { PaymentIssueStatus } from '../enums/payment-issue-status.enum';
import { PaymentIssueType } from '../enums/payment-issue-type.enum';
import { PaymentMethod } from '../enums/payment-method.enum';
import { Payment } from './payment.entity';

/**
 * Something about a payment that needs a person (or was fixed
 * automatically and is kept for the record). Raised by late-payment
 * handling, gateway reconciliation and COD settlement. At most one OPEN
 * issue per (payment, type), so re-running reconciliation doesn't pile up
 * duplicates.
 */
@Entity('payment_issues')
@Index('IDX_payment_issues_status_created', ['status', 'createdAt'])
export class PaymentIssue extends AbstractBaseEntity {
  @Column({
    type: 'enum',
    enum: PaymentIssueType,
    enumName: 'payment_issue_type_enum',
  })
  type!: PaymentIssueType;

  @Column({
    type: 'enum',
    enum: PaymentIssueStatus,
    enumName: 'payment_issue_status_enum',
    default: PaymentIssueStatus.OPEN,
  })
  status!: PaymentIssueStatus;

  @Column({ type: 'uuid', nullable: true })
  payment_id!: string | null;

  @ManyToOne(() => Payment, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'payment_id' })
  payment!: Payment | null;

  @Column({ type: 'uuid', nullable: true })
  order_id!: string | null;

  @ManyToOne(() => Order, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'order_id' })
  order!: Order | null;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    enumName: 'payment_method_enum',
    nullable: true,
  })
  method!: PaymentMethod | null;

  @Column({ type: 'text' })
  summary!: string;

  @Column({ type: 'jsonb', nullable: true })
  details!: Record<string, unknown> | null;

  @Column({ type: 'uuid', nullable: true })
  resolvedBy!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  resolutionNote!: string | null;
}
