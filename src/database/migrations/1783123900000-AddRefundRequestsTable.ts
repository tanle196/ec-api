import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefundRequestsTable1783123900000 implements MigrationInterface {
  name = 'AddRefundRequestsTable1783123900000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "refund_request_status_enum" AS ENUM (
        'pending', 'approved', 'rejected'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "refund_requests" (
        "id"            UUID                            NOT NULL DEFAULT uuid_generate_v4(),
        "payment_id"    UUID                            NOT NULL,
        "order_id"      UUID                            NOT NULL,
        "requested_by"  UUID                            NOT NULL,
        "amount"        NUMERIC(12,2)                   NOT NULL,
        "reason"        TEXT                            NOT NULL,
        "status"        "refund_request_status_enum"    NOT NULL DEFAULT 'pending',
        "adminNote"     TEXT,
        "reviewedBy"    UUID,
        "reviewedAt"    TIMESTAMP,
        "refund_id"     UUID,
        "createdAt"     TIMESTAMPTZ                     NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMPTZ                     NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refund_requests" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "refund_requests"
        ADD CONSTRAINT "FK_refund_requests_payment_id"
        FOREIGN KEY ("payment_id") REFERENCES "payments"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "refund_requests"
        ADD CONSTRAINT "FK_refund_requests_order_id"
        FOREIGN KEY ("order_id") REFERENCES "orders"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "refund_requests"
        ADD CONSTRAINT "FK_refund_requests_refund_id"
        FOREIGN KEY ("refund_id") REFERENCES "refunds"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_refund_requests_payment_id" ON "refund_requests" ("payment_id")
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_refund_requests_status" ON "refund_requests" ("status")
    `);

    await queryRunner.query(`
      CREATE TABLE "refund_request_items" (
        "id"                  UUID          NOT NULL DEFAULT uuid_generate_v4(),
        "refund_request_id"   UUID          NOT NULL,
        "order_item_id"       UUID          NOT NULL,
        "quantity"            INTEGER       NOT NULL,
        "amount"              NUMERIC(12,2) NOT NULL,
        CONSTRAINT "PK_refund_request_items" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "refund_request_items"
        ADD CONSTRAINT "FK_refund_request_items_refund_request_id"
        FOREIGN KEY ("refund_request_id") REFERENCES "refund_requests"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "refund_request_items"
        ADD CONSTRAINT "FK_refund_request_items_order_item_id"
        FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_refund_request_items_refund_request_id" ON "refund_request_items" ("refund_request_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "IDX_refund_request_items_refund_request_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refund_request_items" DROP CONSTRAINT "FK_refund_request_items_order_item_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refund_request_items" DROP CONSTRAINT "FK_refund_request_items_refund_request_id"`,
    );
    await queryRunner.query(`DROP TABLE "refund_request_items"`);

    await queryRunner.query(`DROP INDEX "IDX_refund_requests_status"`);
    await queryRunner.query(`DROP INDEX "IDX_refund_requests_payment_id"`);
    await queryRunner.query(
      `ALTER TABLE "refund_requests" DROP CONSTRAINT "FK_refund_requests_refund_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refund_requests" DROP CONSTRAINT "FK_refund_requests_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "refund_requests" DROP CONSTRAINT "FK_refund_requests_payment_id"`,
    );
    await queryRunner.query(`DROP TABLE "refund_requests"`);
    await queryRunner.query(`DROP TYPE "refund_request_status_enum"`);
  }
}
