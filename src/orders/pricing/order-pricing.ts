import Big from 'big.js';
import { allocateProportionally } from '@/common/utils/allocation.util';
import { toMoney } from '@/common/utils/money.util';

export interface LineAllocation {
  discountAmount: number;
  shippingAmount: number;
  paidAmount: number;
}

/**
 * Per-line breakdown of an order's money. `lineDiscounts` is the total
 * discount already allocated to each line (summed across codes). The
 * shipping fee is spread by line total. Each line's
 * paidAmount = total - discount + shipping, so the paidAmounts sum to
 * exactly subtotal - discount + shippingFee = order.total.
 */
export function allocateOrderLines(
  lineTotals: number[],
  lineDiscounts: number[],
  shippingFee: number,
): LineAllocation[] {
  if (lineTotals.length !== lineDiscounts.length) {
    throw new Error('lineTotals and lineDiscounts must be the same length');
  }

  const shipping = allocateProportionally(shippingFee, lineTotals);

  return lineTotals.map((total, i) => ({
    discountAmount: lineDiscounts[i],
    shippingAmount: shipping[i],
    paidAmount: toMoney(
      new Big(total).minus(lineDiscounts[i]).plus(shipping[i]),
    ),
  }));
}
