import { MigrationInterface, QueryRunner } from 'typeorm';

// Two concurrent "add to cart" requests for the same variant could both read
// no existing row before either wrote, leaving two cart_item rows for one
// (cart_id, variant_id) pair. This constraint closes that race at the DB
// level and backs the ON CONFLICT upsert CartsService.addItem now uses.
export class AddCartItemsVariantUniqueConstraint1783124000000 implements MigrationInterface {
  name = 'AddCartItemsVariantUniqueConstraint1783124000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Pre-existing duplicate rows (from the race this migration closes) would
    // violate the new constraint, so fold them into a single row per variant
    // first: keep the oldest row (id as tiebreaker on createdAt ties), sum
    // the quantities into it, and drop the rest.
    await queryRunner.query(`
      WITH ranked AS (
        SELECT "id", "cart_id", "variant_id",
          ROW_NUMBER() OVER (
            PARTITION BY "cart_id", "variant_id"
            ORDER BY "createdAt" ASC, "id" ASC
          ) AS rn,
          SUM("quantity") OVER (PARTITION BY "cart_id", "variant_id") AS total_quantity
        FROM "cart_items"
      )
      UPDATE "cart_items"
      SET "quantity" = ranked.total_quantity
      FROM ranked
      WHERE "cart_items"."id" = ranked."id" AND ranked.rn = 1
    `);

    await queryRunner.query(`
      WITH ranked AS (
        SELECT "id",
          ROW_NUMBER() OVER (
            PARTITION BY "cart_id", "variant_id"
            ORDER BY "createdAt" ASC, "id" ASC
          ) AS rn
        FROM "cart_items"
      )
      DELETE FROM "cart_items"
      WHERE "id" IN (SELECT "id" FROM ranked WHERE rn > 1)
    `);

    await queryRunner.query(`
      ALTER TABLE "cart_items"
        ADD CONSTRAINT "UQ_cart_items_cart_id_variant_id"
        UNIQUE ("cart_id", "variant_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "UQ_cart_items_cart_id_variant_id"`,
    );
  }
}
