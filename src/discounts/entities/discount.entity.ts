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

  @Column({ type: 'int', nullable: true })
  usageLimit!: number | null;

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
