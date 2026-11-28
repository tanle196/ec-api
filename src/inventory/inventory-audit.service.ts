import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import {
  InventoryAuditMismatchDto,
  InventoryAuditResponseDto,
} from './dto/inventory-response.dto';

/**
 * Checks the ledger invariant for every variant:
 *   SUM(onHandDelta)   = stock + reserved
 *   SUM(reservedDelta) = reserved
 * A mismatch means some code path changed the counters without writing a
 * movement (or vice versa) and needs investigating. Runs nightly and on
 * demand from the admin API.
 */
@Injectable()
export class InventoryAuditService {
  private readonly logger = new Logger(InventoryAuditService.name);

  constructor(private readonly dataSource: DataSource) {}

  async audit(): Promise<InventoryAuditResponseDto> {
    const rows: {
      variant_id: string;
      sku: string;
      stock: number;
      reserved: number;
      ledger_on_hand: string;
      ledger_reserved: string;
      mismatch: boolean;
    }[] = await this.dataSource.query(`
      SELECT v."id" AS variant_id, v."sku", v."stock", v."reserved",
        COALESCE(SUM(m."onHandDelta"), 0)   AS ledger_on_hand,
        COALESCE(SUM(m."reservedDelta"), 0) AS ledger_reserved,
        (COALESCE(SUM(m."onHandDelta"), 0) <> v."stock" + v."reserved"
          OR COALESCE(SUM(m."reservedDelta"), 0) <> v."reserved") AS mismatch
      FROM "product_variants" v
      LEFT JOIN "inventory_movements" m ON m."variant_id" = v."id"
      GROUP BY v."id"
    `);

    const mismatches: InventoryAuditMismatchDto[] = rows
      .filter((r) => r.mismatch)
      .map((r) => ({
        variant_id: r.variant_id,
        sku: r.sku,
        stock: Number(r.stock),
        reserved: Number(r.reserved),
        ledgerOnHand: Number(r.ledger_on_hand),
        ledgerReserved: Number(r.ledger_reserved),
      }));

    return {
      checkedAt: new Date(),
      variantsChecked: rows.length,
      mismatches,
    };
  }

  @Cron(CronExpression.EVERY_DAY_AT_2AM, { name: 'inventory-audit' })
  async runNightly(): Promise<void> {
    try {
      const result = await this.audit();
      if (result.mismatches.length > 0) {
        this.logger.error(
          `Inventory ledger mismatch on ${result.mismatches.length} variant(s): ${result.mismatches
            .slice(0, 20)
            .map((m) => m.sku)
            .join(', ')}`,
        );
      } else {
        this.logger.log(
          `Inventory ledger OK (${result.variantsChecked} variants)`,
        );
      }
    } catch (error) {
      this.logger.error(
        'Inventory audit failed',
        error instanceof Error ? error.stack : error,
      );
    }
  }
}
