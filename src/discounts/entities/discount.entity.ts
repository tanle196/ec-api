import { Column, Entity, ManyToMany } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import type { Order } from '@/orders/entities/order.entity';
import { DiscountType } from '../enums/discount-type.enum';
import { moneyTransformer } from '@/common/utils/money.util';

@Entity('discounts')
export class Discount extends AbstractBaseEntity {
  @Column({ unique: true })
  code!: string;

  @Column({ type: 'enum', enum: DiscountType })
  type!: DiscountType;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    transformer: moneyTransformer,
  })
  value!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: moneyTransformer,
  })
  minOrderValue!: number | null;

  // Cap on what a percent code can take off (e.g. 20% up to 100.000đ).
  // Ignored for fixed codes, whose value is already the cap.
  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    nullable: true,
    transformer: moneyTransformer,
  })
  maxDiscountAmount!: number | null;

  @Column({ type: 'int', nullable: true })
  usageLimit!: number | null;

  // Max active redemptions per customer (null = unlimited).
  @Column({ type: 'int', nullable: true })
  perUserLimit!: number | null;

  // Scope: when both are null/empty the code applies to the whole order.
  // Otherwise only to lines whose product is listed or whose category is
  // listed (descendant categories included).
  @Column({ type: 'uuid', array: true, nullable: true })
  productIds!: string[] | null;

  @Column({ type: 'uuid', array: true, nullable: true })
  categoryIds!: string[] | null;

  @Column({ type: 'int', default: 0 })
  usedCount!: number;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  startsAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  expiresAt!: Date | null;

  @ManyToMany('Order', 'discounts', { eager: false })
  orders!: Order[];
}
