import {
  BadRequestException,
  Injectable,
  UnprocessableEntityException,
} from '@nestjs/common';
import Big from 'big.js';
import { toMoney } from '@/common/utils/money.util';
import { ProductVariant } from '@/products/entities/product-variant.entity';

// Business rules for stock. Locking and the counter/ledger writes stay in
// InventoryService.
@Injectable()
export class InventoryPolicy {
  /**
   * Weighted average cost after receiving `qty` units at `unitCost` on top
   * of `onHand` units averaging `avgCost`. With nothing on hand, or no cost
   * known yet, the old average carries no information and the receipt's
   * cost becomes the average.
   */
  weightedAverageCost(
    onHand: number,
    avgCost: number | null,
    qty: number,
    unitCost: number,
  ): number {
    if (onHand <= 0 || avgCost === null) return toMoney(unitCost);
    return toMoney(
      new Big(avgCost)
        .times(onHand)
        .plus(new Big(unitCost).times(qty))
        .div(onHand + qty),
    );
  }

  /**
   * Turns an adjustment request into a delta on available/on-hand stock.
   * Exactly one of `onHand` (the counted quantity) or `delta` must be
   * given. Reserved units belong to open orders, so on hand may not be set
   * below them.
   */
  resolveAdjustmentDelta(
    variant: Pick<ProductVariant, 'stock' | 'reserved'>,
    input: { onHand?: number; delta?: number },
  ): number {
    const hasOnHand = input.onHand !== undefined;
    const hasDelta = input.delta !== undefined;
    if (hasOnHand === hasDelta) {
      throw new BadRequestException('Provide exactly one of onHand or delta');
    }

    const currentOnHand = variant.stock + variant.reserved;
    const delta = hasOnHand
      ? (input.onHand as number) - currentOnHand
      : (input.delta as number);

    if (delta === 0) {
      throw new BadRequestException('Adjustment does not change the stock');
    }
    if (variant.stock + delta < 0) {
      throw new UnprocessableEntityException(
        `On hand cannot go below the ${variant.reserved} unit(s) reserved for open orders`,
      );
    }
    return delta;
  }

  // Shipping units that were never reserved must come out of available
  // stock, which has to cover them.
  assertCanShip(
    variant: Pick<ProductVariant, 'sku' | 'stock'>,
    fromAvailable: number,
  ): void {
    if (fromAvailable > variant.stock) {
      throw new UnprocessableEntityException(
        `Not enough stock to ship variant ${variant.sku}`,
      );
    }
  }
}
