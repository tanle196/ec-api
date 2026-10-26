import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { Order } from './order.entity';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderStatusChangeActor } from '../enums/order-status-change-actor.enum';

@Entity('order_status_history')
export class OrderStatusHistory extends AbstractBaseEntity {
  @Column({ type: 'uuid' })
  order_id!: string;

  @ManyToOne(() => Order, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ type: 'enum', enum: OrderStatus, nullable: true })
  fromStatus!: OrderStatus | null;

  @Column({ type: 'enum', enum: OrderStatus })
  toStatus!: OrderStatus;

  @Column({ type: 'enum', enum: OrderStatusChangeActor })
  changedByType!: OrderStatusChangeActor;

  @Column({ type: 'uuid', nullable: true })
  changedById!: string | null;

  @Column({ type: 'text', nullable: true })
  note!: string | null;
}
