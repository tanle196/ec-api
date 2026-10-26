import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefundsTables1783123700000 implements MigrationInterface {
  name = 'AddRefundsTables1783123700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "payment_status_enum" ADD VALUE 'partially_refunded'`,
    );
    await queryRunner.query(
      `ALTER TYPE "order_status_enum" ADD VALUE 'partially_refunded'`,
    );

    await queryRunner.query(`
      CREATE TYPE "refund_status_enum" AS ENUM (
        'pending', 'succeeded', 'failed'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "refunds" (
        "id"            UUID                    NOT NULL DEFAULT uuid_generate_v4(),
        "payment_id"    UUID                    NOT NULL,
        "order_id"      UUID                    NOT NULL,
        "amount"        NUMERIC(12,2)           NOT NULL,
        "reason"        TEXT                    NOT NULL,
        "status"        "refund_status_enum"    NOT NULL DEFAULT 'pending',
        "transactionId" CHARACTER VARYING,
        "actorId"       UUID,
        "metadata"      JSONB,
        "createdAt"     TIMESTAMPTZ             NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMPTZ             NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refunds" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "refunds"
        ADD CONSTRAINT "FK_refunds_payment_id"
        FOREIGN KEY ("payment_id") REFERENCES "payments"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "refunds"
        ADD CONSTRAINT "FK_refunds_order_id"
        FOREIGN KEY ("order_id") REFERENCES "orders"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_refunds_payment_id" ON "refunds" ("payment_id")
    `);

    await queryRunner.query(`
      CREATE TABLE "refund_items" (
        "id"            UUID          NOT NULL DEFAULT uuid_generate_v4(),
        "refund_id"     UUID          NOT NULL,
        "order_item_id" UUID          NOT NULL,
        "quantity"      INTEGER       NOT NULL,
        "amount"        NUMERIC(12,2) NOT NULL,
        CONSTRAINT "PK_refund_items" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "refund_items"
        ADD CONSTRAINT "FK_refund_items_refund_id"
        FOREIGN KEY ("refund_id") REFERENCES "refunds"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "refund_items"
        ADD CONSTRAINT "FK_refund_items_order_item_id"
        FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_refund_items_refund_id" ON "refund_items" ("refund_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_refund_items_refund_id"`);
    await queryRunner.query(
      `ALTER TABLE "refund_items" DROP CONSTRAINT "FK_refund_items_order_item_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refund_items" DROP CONSTRAINT "FK_refund_items_refund_id"`,
    );
    await queryRunner.query(`DROP TABLE "refund_items"`);

    await queryRunner.query(`DROP INDEX "IDX_refunds_payment_id"`);
    await queryRunner.query(
      `ALTER TABLE "refunds" DROP CONSTRAINT "FK_refunds_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refunds" DROP CONSTRAINT "FK_refunds_payment_id"`,
    );
    await queryRunner.query(`DROP TABLE "refunds"`);
    await queryRunner.query(`DROP TYPE "refund_status_enum"`);

    // Postgres doesn't support removing a single enum value; rebuilding the
    // type is destructive to any rows already using it, so we intentionally
    // leave 'partially_refunded' in place on rollback.
  }
}
