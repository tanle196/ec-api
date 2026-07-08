import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractIdEntity } from '@/common/entities/base.entity';
import { OrderItem } from '@/orders/entities/order-item.entity';
import { Refund } from './refund.entity';

@Entity('refund_items')
export class RefundItem extends AbstractIdEntity {
  @Column({ type: 'uuid' })
  refund_id!: string;

  @ManyToOne(() => Refund, (r) => r.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'refund_id' })
  refund!: Refund;

  @Column({ type: 'uuid' })
  order_item_id!: string;

  @ManyToOne(() => OrderItem, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_item_id' })
  orderItem!: OrderItem;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  amount!: number;
}
