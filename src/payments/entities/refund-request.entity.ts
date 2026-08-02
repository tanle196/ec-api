import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { Order } from '@/orders/entities/order.entity';
import { Payment } from './payment.entity';
import { Refund } from './refund.entity';
import { RefundRequestItem } from './refund-request-item.entity';
import { RefundRequestStatus } from '../enums/refund-request-status.enum';

@Entity('refund_requests')
export class RefundRequest extends AbstractBaseEntity {
  @Column({ type: 'uuid' })
  payment_id!: string;

  @ManyToOne(() => Payment, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'payment_id' })
  payment!: Payment;

  @Column({ type: 'uuid' })
  order_id!: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ type: 'uuid' })
  requested_by!: string;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: number;

  @Column({ type: 'text' })
  reason!: string;

  @Column({
    type: 'enum',
    enum: RefundRequestStatus,
    default: RefundRequestStatus.PENDING,
  })
  status!: RefundRequestStatus;

  @Column({ type: 'text', nullable: true })
  adminNote!: string | null;

  @Column({ type: 'uuid', nullable: true })
  reviewedBy!: string | null;

  @Column({ type: 'timestamp', nullable: true })
  reviewedAt!: Date | null;

  @Column({ type: 'uuid', nullable: true })
  refund_id!: string | null;

  @ManyToOne(() => Refund, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'refund_id' })
  refund!: Refund | null;

  @OneToMany(() => RefundRequestItem, (item) => item.refundRequest, {
    cascade: true,
    eager: true,
  })
  items!: RefundRequestItem[];
}
