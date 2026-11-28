import { MigrationInterface, QueryRunner } from 'typeorm';

// Inventory, step 1:
// - product_variants.reserved: units held for unshipped orders. `stock`
//   keeps meaning "available to sell", so on hand = stock + reserved.
// - inventory_movements: append-only ledger behind both counters.
// - stock_receipts / stock_receipt_items: goods-received notes.
// - avgCost per variant, unitCost snapshot per shipped order line.
export class AddInventoryLedger1783124200000 implements MigrationInterface {
  name = 'AddInventoryLedger1783124200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "product_variants"
        ADD COLUMN "reserved"          INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN "lowStockThreshold" INTEGER,
        ADD COLUMN "avgCost"           NUMERIC(12,2)
    `);

    // Until now an order's stock was decremented when it was placed and
    // never touched again (cancel restored it). So everything on orders
    // that haven't shipped is exactly what is held for them today.
    await queryRunner.query(`
      UPDATE "product_variants" v
      SET "reserved" = held.qty
      FROM (
        SELECT oi."variant_id", SUM(oi."quantity") AS qty
        FROM "order_items" oi
        JOIN "orders" o ON o."id" = oi."order_id"
        WHERE o."status" IN ('pending', 'confirmed', 'processing')
          AND oi."variant_id" IS NOT NULL
        GROUP BY oi."variant_id"
      ) held
      WHERE held."variant_id" = v."id"
    `);

    // Both counters are only ever moved by guarded updates; make the
    // database refuse anything that would take them negative.
    await queryRunner.query(`
      ALTER TABLE "product_variants"
        ADD CONSTRAINT "CHK_product_variants_stock_non_negative" CHECK ("stock" >= 0),
        ADD CONSTRAINT "CHK_product_variants_reserved_non_negative" CHECK ("reserved" >= 0)
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items" ADD COLUMN "unitCost" NUMERIC(12,2)
    `);

    await queryRunner.query(`
      CREATE TYPE "inventory_movements_reason_enum" AS ENUM (
        'opening_balance', 'initial_stock', 'order_reserve', 'order_release',
        'order_ship', 'purchase_in', 'adjustment'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "inventory_movements" (
        "id"            UUID                               NOT NULL DEFAULT uuid_generate_v4(),
        "variant_id"    UUID,
        "sku"           CHARACTER VARYING                  NOT NULL,
        "reason"        "inventory_movements_reason_enum"  NOT NULL,
        "onHandDelta"   INTEGER                            NOT NULL,
        "reservedDelta" INTEGER                            NOT NULL,
        "refType"       CHARACTER VARYING,
        "refId"         UUID,
        "actorId"       UUID,
        "note"          TEXT,
        "createdAt"     TIMESTAMPTZ                        NOT NULL DEFAULT now(),
        CONSTRAINT "PK_inventory_movements" PRIMARY KEY ("id"),
        CONSTRAINT "FK_inventory_movements_variant_id"
          FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_movements_variant_created"
        ON "inventory_movements" ("variant_id", "createdAt")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_inventory_movements_ref"
        ON "inventory_movements" ("refType", "refId")
    `);

    // One opening row per variant so the ledger balances from day one.
    await queryRunner.query(`
      INSERT INTO "inventory_movements"
        ("variant_id", "sku", "reason", "onHandDelta", "reservedDelta", "note")
      SELECT "id", "sku", 'opening_balance', "stock" + "reserved", "reserved",
        'Balance when the inventory ledger was introduced'
      FROM "product_variants"
    `);

    await queryRunner.query(`
      CREATE TYPE "stock_receipts_status_enum" AS ENUM ('draft', 'confirmed', 'cancelled')
    `);

    await queryRunner.query(`
      CREATE TABLE "stock_receipts" (
        "id"          UUID                          NOT NULL DEFAULT uuid_generate_v4(),
        "code"        CHARACTER VARYING             NOT NULL,
        "supplier"    CHARACTER VARYING,
        "note"        TEXT,
        "status"      "stock_receipts_status_enum"  NOT NULL DEFAULT 'draft',
        "totalCost"   NUMERIC(14,2)                 NOT NULL DEFAULT 0,
        "createdBy"   UUID                          NOT NULL,
        "confirmedBy" UUID,
        "confirmedAt" TIMESTAMPTZ,
        "createdAt"   TIMESTAMPTZ                   NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMPTZ                   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_stock_receipts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_stock_receipts_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "stock_receipt_items" (
        "id"         UUID               NOT NULL DEFAULT uuid_generate_v4(),
        "receipt_id" UUID               NOT NULL,
        "variant_id" UUID,
        "sku"        CHARACTER VARYING  NOT NULL,
        "quantity"   INTEGER            NOT NULL,
        "unitCost"   NUMERIC(12,2)      NOT NULL,
        CONSTRAINT "PK_stock_receipt_items" PRIMARY KEY ("id"),
        CONSTRAINT "CHK_stock_receipt_items_quantity_positive" CHECK ("quantity" > 0),
        CONSTRAINT "CHK_stock_receipt_items_unit_cost_non_negative" CHECK ("unitCost" >= 0),
        CONSTRAINT "FK_stock_receipt_items_receipt_id"
          FOREIGN KEY ("receipt_id") REFERENCES "stock_receipts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_stock_receipt_items_variant_id"
          FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "stock_receipt_items"`);
    await queryRunner.query(`DROP TABLE "stock_receipts"`);
    await queryRunner.query(`DROP TYPE "stock_receipts_status_enum"`);
    await queryRunner.query(`DROP TABLE "inventory_movements"`);
    await queryRunner.query(`DROP TYPE "inventory_movements_reason_enum"`);
    await queryRunner.query(`ALTER TABLE "order_items" DROP COLUMN "unitCost"`);
    await queryRunner.query(`
      ALTER TABLE "product_variants"
        DROP CONSTRAINT "CHK_product_variants_reserved_non_negative",
        DROP CONSTRAINT "CHK_product_variants_stock_non_negative"
    `);
    // `stock` already excludes reserved units, so dropping the column puts
    // the variant back exactly where the old model expects it.
    await queryRunner.query(`
      ALTER TABLE "product_variants"
        DROP COLUMN "avgCost",
        DROP COLUMN "lowStockThreshold",
        DROP COLUMN "reserved"
    `);
  }
}
