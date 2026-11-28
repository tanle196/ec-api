import { Column, Entity } from 'typeorm';
import { AbstractBaseEntity } from '@/common/entities/base.entity';
import { moneyTransformer } from '@/common/utils/money.util';
import { ShippingZone } from '../enums/shipping-zone.enum';

/**
 * The shop's own price list for shipping, one row per zone:
 *   fee = baseFee                                  up to baseWeightGrams
 *       + stepFee per started stepWeightGrams      above that
 * e.g. 22.000đ for the first 500 g, then 5.000đ per extra 500 g.
 */
@Entity('shipping_rates')
export class ShippingRate extends AbstractBaseEntity {
  @Column({
    type: 'enum',
    enum: ShippingZone,
    enumName: 'shipping_zone_enum',
    unique: true,
  })
  zone!: ShippingZone;

  @Column({ type: 'int' })
  baseWeightGrams!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: moneyTransformer,
  })
  baseFee!: number;

  @Column({ type: 'int' })
  stepWeightGrams!: number;

  @Column({
    type: 'decimal',
    precision: 12,
    scale: 2,
    transformer: moneyTransformer,
  })
  stepFee!: number;
}
