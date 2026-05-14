import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentsTable1747440000000 implements MigrationInterface {
  name = 'AddPaymentsTable1747440000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "payment_method_enum" AS ENUM (
        'cod', 'vnpay', 'momo', 'zalopay', 'stripe', 'bank_transfer'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "payment_status_enum" AS ENUM (
        'pending', 'completed', 'failed', 'refunded'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "payments" (
        "id"            UUID                    NOT NULL DEFAULT uuid_generate_v4(),
        "order_id"      UUID                    NOT NULL,
        "method"        "payment_method_enum"   NOT NULL,
        "status"        "payment_status_enum"   NOT NULL DEFAULT 'pending',
        "amount"        NUMERIC(12,2)           NOT NULL,
        "transactionId" CHARACTER VARYING,
        "metadata"      JSONB,
        "paidAt"        TIMESTAMP,
        "createdAt"     TIMESTAMP               NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP               NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payments" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "payments"
        ADD CONSTRAINT "FK_payments_order_id"
        FOREIGN KEY ("order_id") REFERENCES "orders"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_order_id"`,
    );
    await queryRunner.query(`DROP TABLE "payments"`);
    await queryRunner.query(`DROP TYPE "payment_status_enum"`);
    await queryRunner.query(`DROP TYPE "payment_method_enum"`);
  }
}
