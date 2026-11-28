import { MigrationInterface, QueryRunner } from 'typeorm';

// Promotion engine, step 1:
// - discounts: percent cap, per-customer limit, product/category scope.
// - discount_redemptions: per-order ledger behind usedCount, so cancelling
//   an order can give the use back and perUserLimit has something to count.
// - order_items: the order's discount and shipping fee allocated per line,
//   and the resulting paidAmount, so refunds stop re-deriving them by ratio.
export class AddDiscountAllocationAndRedemptions1783124100000 implements MigrationInterface {
  name = 'AddDiscountAllocationAndRedemptions1783124100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "discounts"
        ADD COLUMN "maxDiscountAmount" NUMERIC(12,2),
        ADD COLUMN "perUserLimit"      INTEGER,
        ADD COLUMN "productIds"        UUID[],
        ADD COLUMN "categoryIds"       UUID[]
    `);

    await queryRunner.query(`
      CREATE TYPE "discount_redemptions_status_enum" AS ENUM ('active', 'released')
    `);

    await queryRunner.query(`
      CREATE TABLE "discount_redemptions" (
        "id"          UUID                                NOT NULL DEFAULT uuid_generate_v4(),
        "discount_id" UUID                                NOT NULL,
        "order_id"    UUID                                NOT NULL,
        "user_id"     UUID                                NOT NULL,
        "status"      "discount_redemptions_status_enum"  NOT NULL DEFAULT 'active',
        "amount"      NUMERIC(12,2)                       NOT NULL,
        "releasedAt"  TIMESTAMPTZ,
        "createdAt"   TIMESTAMPTZ                         NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMPTZ                         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_discount_redemptions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_discount_redemptions_order_discount" UNIQUE ("order_id", "discount_id"),
        CONSTRAINT "FK_discount_redemptions_discount_id"
          FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_discount_redemptions_order_id"
          FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE
      )
    `);

    // Backs the perUserLimit count.
    await queryRunner.query(`
      CREATE INDEX "IDX_discount_redemptions_discount_user_status"
        ON "discount_redemptions" ("discount_id", "user_id", "status")
    `);

    // Every existing order_discount row becomes a redemption. The checkout
    // flow has only ever applied one code per order, so order.discount is
    // that code's amount. Cancelled orders are released retroactively.
    await queryRunner.query(`
      INSERT INTO "discount_redemptions"
        ("discount_id", "order_id", "user_id", "status", "amount", "releasedAt")
      SELECT od."discount_id", od."order_id", o."user_id",
        CASE WHEN o."status" = 'cancelled' THEN 'released' ELSE 'active' END::"discount_redemptions_status_enum",
        o."discount",
        CASE WHEN o."status" = 'cancelled' THEN o."updatedAt" END
      FROM "order_discount" od
      JOIN "orders" o ON o."id" = od."order_id"
    `);

    // Give back the uses those cancelled orders consumed. Decremented
    // rather than recounted so usage recorded outside order_discount (e.g.
    // seeded counts) is preserved.
    await queryRunner.query(`
      UPDATE "discounts" d
      SET "usedCount" = GREATEST(d."usedCount" - r.released, 0)
      FROM (
        SELECT "discount_id", COUNT(*) AS released
        FROM "discount_redemptions"
        WHERE "status" = 'released'
        GROUP BY "discount_id"
      ) r
      WHERE r."discount_id" = d."id"
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items"
        ADD COLUMN "discountAmount" NUMERIC(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN "shippingAmount" NUMERIC(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN "paidAmount"     NUMERIC(12,2) NOT NULL DEFAULT 0
    `);

    // Same allocation as allocateProportionally(): each line gets its
    // rounded share by line total, and the rounding residual goes to the
    // largest line, so per-order sums match order.discount/shippingFee.
    await queryRunner.query(`
      WITH base AS (
        SELECT oi."id", oi."order_id", oi."total",
          o."discount", o."shippingFee",
          SUM(oi."total") OVER (PARTITION BY oi."order_id") AS line_sum,
          ROW_NUMBER() OVER (
            PARTITION BY oi."order_id" ORDER BY oi."total" DESC, oi."id"
          ) AS rn
        FROM "order_items" oi
        JOIN "orders" o ON o."id" = oi."order_id"
      ),
      shares AS (
        SELECT *,
          CASE WHEN line_sum > 0 THEN ROUND("total" * "discount" / line_sum, 2) ELSE 0 END AS d,
          CASE WHEN line_sum > 0 THEN ROUND("total" * "shippingFee" / line_sum, 2) ELSE 0 END AS s
        FROM base
      ),
      sums AS (
        SELECT "order_id", SUM(d) AS sd, SUM(s) AS ss
        FROM shares GROUP BY "order_id"
      )
      UPDATE "order_items" oi SET
        "discountAmount" = sh.d + CASE WHEN sh.rn = 1 THEN sh."discount" - su.sd ELSE 0 END,
        "shippingAmount" = sh.s + CASE WHEN sh.rn = 1 THEN sh."shippingFee" - su.ss ELSE 0 END
      FROM shares sh
      JOIN sums su ON su."order_id" = sh."order_id"
      WHERE oi."id" = sh."id"
    `);

    await queryRunner.query(`
      UPDATE "order_items"
      SET "paidAmount" = "total" - "discountAmount" + "shippingAmount"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // usedCount is not restored: the uses given back to cancelled orders
    // stay given back.
    await queryRunner.query(`
      ALTER TABLE "order_items"
        DROP COLUMN "paidAmount",
        DROP COLUMN "shippingAmount",
        DROP COLUMN "discountAmount"
    `);
    await queryRunner.query(`DROP TABLE "discount_redemptions"`);
    await queryRunner.query(`DROP TYPE "discount_redemptions_status_enum"`);
    await queryRunner.query(`
      ALTER TABLE "discounts"
        DROP COLUMN "categoryIds",
        DROP COLUMN "productIds",
        DROP COLUMN "perUserLimit",
        DROP COLUMN "maxDiscountAmount"
    `);
  }
}
