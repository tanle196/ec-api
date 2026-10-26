import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPaymentWebhookEventsTable1783123600000 implements MigrationInterface {
  name = 'AddPaymentWebhookEventsTable1783123600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "webhook_processing_status_enum" AS ENUM (
        'received', 'processed', 'ignored', 'error'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "payment_webhook_events" (
        "id"           UUID                              NOT NULL DEFAULT uuid_generate_v4(),
        "provider"     "payment_method_enum"              NOT NULL,
        "eventId"      CHARACTER VARYING                  NOT NULL,
        "payment_id"   UUID,
        "status"       "webhook_processing_status_enum"   NOT NULL DEFAULT 'received',
        "payload"      JSONB                              NOT NULL,
        "errorMessage" CHARACTER VARYING,
        "createdAt"    TIMESTAMPTZ                        NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMPTZ                        NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_webhook_events" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "payment_webhook_events"
        ADD CONSTRAINT "FK_payment_webhook_events_payment_id"
        FOREIGN KEY ("payment_id") REFERENCES "payments"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_payment_webhook_events_provider_event_id"
        ON "payment_webhook_events" ("provider", "eventId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "UQ_payment_webhook_events_provider_event_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payment_webhook_events" DROP CONSTRAINT "FK_payment_webhook_events_payment_id"`,
    );
    await queryRunner.query(`DROP TABLE "payment_webhook_events"`);
    await queryRunner.query(`DROP TYPE "webhook_processing_status_enum"`);
  }
}
