import { MigrationInterface, QueryRunner } from 'typeorm';

// Shipping, step 1:
// - packed size on variants, total weight on orders
// - carrier location codes on addresses
// - shipping_rates: the shop's own rate table by zone and weight
// - carrier fee / ETA on shipments, carrier_webhook_events
// - discount type free_shipping
export class AddShippingRatesAndCarriers1783124500000 implements MigrationInterface {
  name = 'AddShippingRatesAndCarriers1783124500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "discount_type_enum" ADD VALUE IF NOT EXISTS 'free_shipping'`,
    );

    await queryRunner.query(`
      ALTER TABLE "product_variants"
        ADD COLUMN "weightGrams" INTEGER,
        ADD COLUMN "lengthCm"    INTEGER,
        ADD COLUMN "widthCm"     INTEGER,
        ADD COLUMN "heightCm"    INTEGER
    `);

    await queryRunner.query(`
      ALTER TABLE "addresses"
        ADD COLUMN "districtCode" CHARACTER VARYING,
        ADD COLUMN "wardCode"     CHARACTER VARYING
    `);

    await queryRunner.query(`
      ALTER TABLE "orders" ADD COLUMN "weightGrams" INTEGER NOT NULL DEFAULT 0
    `);
    // No variant has a weight yet, so existing orders weigh 500 g per unit
    // (the DEFAULT_ITEM_WEIGHT_GRAMS default).
    await queryRunner.query(`
      UPDATE "orders" o SET "weightGrams" = w.grams
      FROM (
        SELECT "order_id", SUM("quantity") * 500 AS grams
        FROM "order_items" GROUP BY "order_id"
      ) w
      WHERE w."order_id" = o."id"
    `);

    await queryRunner.query(`
      ALTER TABLE "shipments"
        ADD COLUMN "carrierFee"         NUMERIC(12,2),
        ADD COLUMN "expectedDeliveryAt" TIMESTAMPTZ
    `);

    await queryRunner.query(`
      CREATE TYPE "shipping_zone_enum" AS ENUM ('intra_province', 'inter_province')
    `);
    await queryRunner.query(`
      CREATE TABLE "shipping_rates" (
        "id"              UUID                 NOT NULL DEFAULT uuid_generate_v4(),
        "zone"            "shipping_zone_enum" NOT NULL,
        "baseWeightGrams" INTEGER              NOT NULL,
        "baseFee"         NUMERIC(12,2)        NOT NULL,
        "stepWeightGrams" INTEGER              NOT NULL,
        "stepFee"         NUMERIC(12,2)        NOT NULL,
        "createdAt"       TIMESTAMPTZ          NOT NULL DEFAULT now(),
        "updatedAt"       TIMESTAMPTZ          NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shipping_rates" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_shipping_rates_zone" UNIQUE ("zone"),
        CONSTRAINT "CHK_shipping_rates_positive"
          CHECK ("baseWeightGrams" > 0 AND "stepWeightGrams" > 0 AND "baseFee" >= 0 AND "stepFee" >= 0)
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "carrier_webhook_status_enum" AS ENUM ('received', 'processed', 'unmapped', 'error')
    `);
    await queryRunner.query(`
      CREATE TABLE "carrier_webhook_events" (
        "id"             UUID                          NOT NULL DEFAULT uuid_generate_v4(),
        "carrier"        CHARACTER VARYING             NOT NULL,
        "eventKey"       CHARACTER VARYING             NOT NULL,
        "trackingNumber" CHARACTER VARYING,
        "carrierStatus"  CHARACTER VARYING,
        "shipment_id"    UUID,
        "status"         "carrier_webhook_status_enum" NOT NULL DEFAULT 'received',
        "payload"        JSONB                         NOT NULL,
        "errorMessage"   TEXT,
        "createdAt"      TIMESTAMPTZ                   NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMPTZ                   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_carrier_webhook_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_carrier_webhook_events_shipment_id"
          FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_carrier_webhook_events_key"
        ON "carrier_webhook_events" ("carrier", "eventKey")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_carrier_webhook_events_status"
        ON "carrier_webhook_events" ("status", "createdAt")
    `);
    // Webhooks find shipments by tracking number.
    await queryRunner.query(`
      CREATE INDEX "IDX_shipments_tracking" ON "shipments" ("trackingNumber")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 'free_shipping' stays in discount_type_enum (Postgres can't drop it).
    await queryRunner.query(`DROP INDEX "IDX_shipments_tracking"`);
    await queryRunner.query(`DROP TABLE "carrier_webhook_events"`);
    await queryRunner.query(`DROP TYPE "carrier_webhook_status_enum"`);
    await queryRunner.query(`DROP TABLE "shipping_rates"`);
    await queryRunner.query(`DROP TYPE "shipping_zone_enum"`);
    await queryRunner.query(`
      ALTER TABLE "shipments" DROP COLUMN "expectedDeliveryAt", DROP COLUMN "carrierFee"
    `);
    await queryRunner.query(`ALTER TABLE "orders" DROP COLUMN "weightGrams"`);
    await queryRunner.query(`
      ALTER TABLE "addresses" DROP COLUMN "wardCode", DROP COLUMN "districtCode"
    `);
    await queryRunner.query(`
      ALTER TABLE "product_variants"
        DROP COLUMN "heightCm", DROP COLUMN "widthCm",
        DROP COLUMN "lengthCm", DROP COLUMN "weightGrams"
    `);
  }
}
