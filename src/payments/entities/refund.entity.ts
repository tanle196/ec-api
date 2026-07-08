import { Column, Entity, JoinColumn, ManyToOne, OneToMany } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { Order } from '@/orders/entities/order.entity';
import { Payment } from './payment.entity';
import { RefundItem } from './refund-item.entity';
import { RefundStatus } from '../enums/refund-status.enum';

@Entity('refunds')
export class Refund extends AbstractBaseEntity {
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

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: number;

  @Column({ type: 'text' })
  reason!: string;

  @Column({
    type: 'enum',
    enum: RefundStatus,
    default: RefundStatus.PENDING,
  })
  status!: RefundStatus;

  @Column({ type: 'varchar', nullable: true })
  transactionId!: string | null;

  @Column({ type: 'uuid', nullable: true })
  actorId!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @OneToMany(() => RefundItem, (item) => item.refund, {
    cascade: true,
    eager: true,
  })
  items!: RefundItem[];
}
