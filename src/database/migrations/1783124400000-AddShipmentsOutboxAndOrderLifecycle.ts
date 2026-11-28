import { MigrationInterface, QueryRunner } from 'typeorm';

// Fulfillment, step 1:
// - order statuses delivery_failed, returned_to_sender, completed
// - orders: shippingAddress snapshot, idempotencyKey, deliveredAt,
//   completedAt
// - shipments + shipment_events (tracking history)
// - outbox_events: side effects written in the same transaction as the
//   change they belong to
// - inventory reason return_restock
export class AddShipmentsOutboxAndOrderLifecycle1783124400000 implements MigrationInterface {
  name = 'AddShipmentsOutboxAndOrderLifecycle1783124400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // New enum values can't be used in the transaction that adds them, and
    // nothing below does.
    for (const value of [
      'delivery_failed',
      'returned_to_sender',
      'completed',
    ]) {
      await queryRunner.query(
        `ALTER TYPE "order_status_enum" ADD VALUE IF NOT EXISTS '${value}'`,
      );
    }
    await queryRunner.query(
      `ALTER TYPE "inventory_movements_reason_enum" ADD VALUE IF NOT EXISTS 'return_restock'`,
    );

    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD COLUMN "shippingAddress" JSONB,
        ADD COLUMN "idempotencyKey"  CHARACTER VARYING(100),
        ADD COLUMN "deliveredAt"     TIMESTAMPTZ,
        ADD COLUMN "completedAt"     TIMESTAMPTZ
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_orders_user_idempotency_key"
        ON "orders" ("user_id", "idempotencyKey")
        WHERE "idempotencyKey" IS NOT NULL
    `);

    // Best available snapshot for existing orders: the address as it is
    // now. Orders whose address was deleted keep null.
    await queryRunner.query(`
      UPDATE "orders" o SET "shippingAddress" = jsonb_build_object(
        'fullName', a."fullName", 'phone', a."phone",
        'addressLine1', a."addressLine1", 'addressLine2', a."addressLine2",
        'city', a."city", 'province', a."province",
        'country', a."country", 'postalCode', a."postalCode")
      FROM "addresses" a WHERE a."id" = o."address_id"
    `);

    // Delivery time from the status history, falling back to updatedAt.
    await queryRunner.query(`
      UPDATE "orders" o SET "deliveredAt" = COALESCE(
        (SELECT MAX(h."createdAt") FROM "order_status_history" h
          WHERE h."order_id" = o."id" AND h."toStatus" = 'delivered'),
        o."updatedAt")
      WHERE o."status" = 'delivered'
    `);

    await queryRunner.query(`
      CREATE TYPE "shipment_status_enum" AS ENUM (
        'in_transit', 'delivered', 'delivery_failed', 'returning', 'returned'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "shipment_event_source_enum" AS ENUM ('admin', 'carrier', 'system')
    `);
    await queryRunner.query(`
      CREATE TABLE "shipments" (
        "id"             UUID                   NOT NULL DEFAULT uuid_generate_v4(),
        "order_id"       UUID                   NOT NULL,
        "status"         "shipment_status_enum" NOT NULL DEFAULT 'in_transit',
        "carrier"        CHARACTER VARYING      NOT NULL,
        "trackingNumber" CHARACTER VARYING,
        "attempts"       INTEGER                NOT NULL DEFAULT 1,
        "shippedAt"      TIMESTAMPTZ            NOT NULL,
        "deliveredAt"    TIMESTAMPTZ,
        "returnedAt"     TIMESTAMPTZ,
        "createdAt"      TIMESTAMPTZ            NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMPTZ            NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shipments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_shipments_order_id"
          FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE
      )
    `);
    // At most one parcel on its way per order.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_shipments_active_order" ON "shipments" ("order_id")
        WHERE "status" IN ('in_transit', 'delivery_failed', 'returning')
    `);
    await queryRunner.query(`
      CREATE TABLE "shipment_events" (
        "id"          UUID                         NOT NULL DEFAULT uuid_generate_v4(),
        "shipment_id" UUID                         NOT NULL,
        "status"      "shipment_status_enum"       NOT NULL,
        "description" TEXT,
        "occurredAt"  TIMESTAMPTZ                  NOT NULL,
        "source"      "shipment_event_source_enum" NOT NULL,
        "actorId"     UUID,
        "raw"         JSONB,
        "createdAt"   TIMESTAMPTZ                  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_shipment_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_shipment_events_shipment_id"
          FOREIGN KEY ("shipment_id") REFERENCES "shipments"("id") ON DELETE CASCADE
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_shipment_events_shipment" ON "shipment_events" ("shipment_id", "occurredAt")
    `);

    // Orders already shipped or delivered get a "legacy" shipment so they
    // can be moved on (delivered, failed, returned) like new ones.
    await queryRunner.query(`
      WITH legacy AS (
        INSERT INTO "shipments" ("order_id", "status", "carrier", "shippedAt", "deliveredAt")
        SELECT o."id",
          CASE WHEN o."status" = 'shipped' THEN 'in_transit' ELSE 'delivered' END::"shipment_status_enum",
          'legacy',
          COALESCE((SELECT MAX(h."createdAt") FROM "order_status_history" h
                     WHERE h."order_id" = o."id" AND h."toStatus" = 'shipped'), o."updatedAt"),
          o."deliveredAt"
        FROM "orders" o WHERE o."status" IN ('shipped', 'delivered')
        RETURNING "id", "status", "shippedAt"
      )
      INSERT INTO "shipment_events" ("shipment_id", "status", "description", "occurredAt", "source")
      SELECT "id", "status", 'Recorded before shipments were tracked', "shippedAt", 'system'
      FROM legacy
    `);

    await queryRunner.query(`
      CREATE TYPE "outbox_event_status_enum" AS ENUM ('pending', 'processed', 'dead')
    `);
    await queryRunner.query(`
      CREATE TABLE "outbox_events" (
        "id"            UUID                       NOT NULL DEFAULT uuid_generate_v4(),
        "type"          CHARACTER VARYING          NOT NULL,
        "aggregateType" CHARACTER VARYING          NOT NULL,
        "aggregateId"   UUID                       NOT NULL,
        "payload"       JSONB                      NOT NULL,
        "status"        "outbox_event_status_enum" NOT NULL DEFAULT 'pending',
        "attempts"      INTEGER                    NOT NULL DEFAULT 0,
        "availableAt"   TIMESTAMPTZ                NOT NULL DEFAULT now(),
        "processedAt"   TIMESTAMPTZ,
        "lastError"     TEXT,
        "createdAt"     TIMESTAMPTZ                NOT NULL DEFAULT now(),
        CONSTRAINT "PK_outbox_events" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_outbox_events_status_available"
        ON "outbox_events" ("status", "availableAt")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Enum values added to order_status_enum / inventory_movements_reason_enum
    // stay: Postgres can't drop enum values.
    await queryRunner.query(`DROP TABLE "outbox_events"`);
    await queryRunner.query(`DROP TYPE "outbox_event_status_enum"`);
    await queryRunner.query(`DROP TABLE "shipment_events"`);
    await queryRunner.query(`DROP TABLE "shipments"`);
    await queryRunner.query(`DROP TYPE "shipment_event_source_enum"`);
    await queryRunner.query(`DROP TYPE "shipment_status_enum"`);
    await queryRunner.query(`DROP INDEX "UQ_orders_user_idempotency_key"`);
    await queryRunner.query(`
      ALTER TABLE "orders"
        DROP COLUMN "completedAt",
        DROP COLUMN "deliveredAt",
        DROP COLUMN "idempotencyKey",
        DROP COLUMN "shippingAddress"
    `);
  }
}
