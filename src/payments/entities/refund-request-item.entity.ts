import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';
import { AbstractIdEntity } from '@/common/entities/base.entity';
import { OrderItem } from '@/orders/entities/order-item.entity';
import { RefundRequest } from './refund-request.entity';

@Entity('refund_request_items')
export class RefundRequestItem extends AbstractIdEntity {
  @Column({ type: 'uuid' })
  refund_request_id!: string;

  @ManyToOne(() => RefundRequest, (r) => r.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'refund_request_id' })
  refundRequest!: RefundRequest;

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
