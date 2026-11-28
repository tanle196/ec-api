import { BadRequestException, Injectable } from '@nestjs/common';
import { StockReceipt } from '../entities/stock-receipt.entity';
import { StockReceiptStatus } from '../enums/stock-receipt-status.enum';

@Injectable()
export class StockReceiptPolicy {
  // Only drafts can be edited, confirmed or cancelled; confirmed receipts
  // are part of the stock history and are corrected with an adjustment.
  assertDraft(receipt: Pick<StockReceipt, 'status' | 'code'>): void {
    if (receipt.status !== StockReceiptStatus.DRAFT) {
      throw new BadRequestException(
        `Stock receipt ${receipt.code} is ${receipt.status}; only drafts can be changed`,
      );
    }
  }

  assertNoDuplicateVariants(items: { variant_id: string }[]): void {
    const seen = new Set<string>();
    for (const item of items) {
      if (seen.has(item.variant_id)) {
        throw new BadRequestException(
          `Variant ${item.variant_id} is listed more than once`,
        );
      }
      seen.add(item.variant_id);
    }
  }
}
