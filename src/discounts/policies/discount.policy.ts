import { BadRequestException, Injectable } from '@nestjs/common';
import { Discount } from '../entities/discount.entity';
import { DiscountType } from '../enums/discount-type.enum';

// Business rules for discounts. Lookups, code uniqueness, amount calculation
// and the atomic usage increment stay in DiscountsService.
@Injectable()
export class DiscountPolicy {
  assertValidValue(type: DiscountType, value: number): void {
    if (type === DiscountType.PERCENT && value > 100) {
      throw new BadRequestException(
        'Percent discount value must be between 0 and 100',
      );
    }
  }

  // Whether the code may be applied to an order with this subtotal right now.
  assertUsable(
    discount: Discount,
    subtotal: number,
    now: Date = new Date(),
  ): void {
    if (!discount.isActive)
      throw new BadRequestException('Discount code is inactive');

    if (discount.startsAt && now < discount.startsAt)
      throw new BadRequestException('Discount code is not yet valid');
    if (discount.expiresAt && now > discount.expiresAt)
      throw new BadRequestException('Discount code has expired');

    if (
      discount.usageLimit !== null &&
      discount.usedCount >= discount.usageLimit
    )
      throw new BadRequestException(
        'Discount code has reached its usage limit',
      );

    if (
      discount.minOrderValue !== null &&
      subtotal < Number(discount.minOrderValue)
    )
      throw new BadRequestException(
        `Minimum order value for this code is ${discount.minOrderValue}`,
      );
  }
}
