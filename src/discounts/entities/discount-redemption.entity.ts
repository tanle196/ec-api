import { Column, Entity, JoinColumn, ManyToOne, Unique } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { moneyTransformer } from '@/common/utils/money.util';
import type { Order } from '@/orders/entities/order.entity';
import { DiscountRedemptionStatus } from '../enums/discount-redemption-status.enum';
import { Discount } from './discount.entity';

// One row per (order, discount): the ledger behind Discount.usedCount. It is
// what lets a cancellation give the use back and what perUserLimit counts.
@Entity('discount_redemptions')
@Unique('UQ_discount_redemptions_order_discount', ['order_id', 'discount_id'])
export class DiscountRedemption extends AbstractBaseEntity {
  @Column({ type: 'uuid' })
  discount_id!: string;

  @ManyToOne(() => Discount, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'discount_id' })
  discount!: Discount;

  @Column({ type: 'uuid' })
  order_id!: string;

  @ManyToOne('Order', { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ type: 'uuid' })
  user_id!: string;

  @Column({
    type: 'enum',
    enum: DiscountRedemptionStatus,
    default: DiscountRedemptionStatus.ACTIVE,
  })
  status!: DiscountRedemptionStatus;

  // What this code took off the order.
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: moneyTransformer,
  })
  amount!: number;

  @Column({ type: 'timestamptz', nullable: true })
  releasedAt!: Date | null;
}
