import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderStatusHistoryTable1783123500000 implements MigrationInterface {
  name = 'AddOrderStatusHistoryTable1783123500000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "order_status_change_actor_enum" AS ENUM (
        'customer', 'admin', 'system'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "order_status_history" (
        "id"            UUID                             NOT NULL DEFAULT uuid_generate_v4(),
        "order_id"      UUID                             NOT NULL,
        "fromStatus"    "order_status_enum",
        "toStatus"      "order_status_enum"               NOT NULL,
        "changedByType" "order_status_change_actor_enum"  NOT NULL,
        "changedById"   UUID,
        "note"          TEXT,
        "createdAt"     TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMPTZ                       NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_status_history" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "order_status_history"
        ADD CONSTRAINT "FK_order_status_history_order_id"
        FOREIGN KEY ("order_id") REFERENCES "orders"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_order_status_history_order_id"
        ON "order_status_history" ("order_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_order_status_history_order_id"`);
    await queryRunner.query(
      `ALTER TABLE "order_status_history" DROP CONSTRAINT "FK_order_status_history_order_id"`,
    );
    await queryRunner.query(`DROP TABLE "order_status_history"`);
    await queryRunner.query(`DROP TYPE "order_status_change_actor_enum"`);
  }
}
