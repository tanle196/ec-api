import { Address } from '@/addresses/entities/address.entity';
import type { ShippingAddressSnapshot } from '../types/shipping-address-snapshot';
import { Discount } from '@/discounts/entities/discount.entity';
import { User } from '@/users/entities/user.entity';
import {
  Column,
  Index,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  OneToMany,
} from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { OrderStatus } from '../enums/order-status.enum';
import { OrderItem } from './order-item.entity';
import { moneyTransformer } from '@/common/utils/money.util';

@Entity('orders')
// The same Idempotency-Key from the same customer always means the same
// order, so a retried "place order" can't create a second one.
@Index('UQ_orders_user_idempotency_key', ['user_id', 'idempotencyKey'], {
  unique: true,
  where: '"idempotencyKey" IS NOT NULL',
})
export class Order extends AbstractBaseEntity {
  @Column({ type: 'uuid' })
  user_id!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'uuid', nullable: true })
  address_id!: string | null;

  @ManyToOne(() => Address, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'address_id' })
  address!: Address | null;

  // The delivery address as it was when the order was placed (or last
  // edited). The address book entry can change or be deleted afterwards;
  // this can't.
  @Column({ type: 'jsonb', nullable: true })
  shippingAddress!: ShippingAddressSnapshot | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  idempotencyKey!: string | null;

  @Column({ unique: true })
  orderNumber!: string;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  status!: OrderStatus;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: moneyTransformer,
  })
  subtotal!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: moneyTransformer,
  })
  shippingFee!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    default: 0,
    transformer: moneyTransformer,
  })
  discount!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: moneyTransformer,
  })
  total!: number;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  // Starts the return window; set when the order reaches DELIVERED.
  @Column({ type: 'timestamptz', nullable: true })
  deliveredAt!: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  completedAt!: Date | null;

  @OneToMany(() => OrderItem, (item) => item.order, {
    cascade: true,
    eager: false,
  })
  items!: OrderItem[];

  @ManyToMany(() => Discount, { eager: false })
  @JoinTable({
    name: 'order_discount',
    joinColumn: { name: 'order_id' },
    inverseJoinColumn: { name: 'discount_id' },
  })
  discounts!: Discount[];
}
