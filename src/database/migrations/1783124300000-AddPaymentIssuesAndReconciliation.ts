import { MigrationInterface, QueryRunner } from 'typeorm';

// Payments, step 1:
// - payment_issues: queue of payment problems for staff (late payments,
//   gateway mismatches, COD discrepancies), at most one open per
//   (payment, type).
// - payments.reconciledAt: when the gateway last confirmed the payment.
export class AddPaymentIssuesAndReconciliation1783124300000 implements MigrationInterface {
  name = 'AddPaymentIssuesAndReconciliation1783124300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "payment_issue_type_enum" AS ENUM (
        'late_payment_refunded', 'late_payment_refund_failed',
        'amount_mismatch', 'webhook_missed', 'gateway_not_paid',
        'gateway_status_unknown', 'paid_on_cancelled_order',
        'cod_amount_mismatch', 'cod_not_delivered'
      )
    `);
    await queryRunner.query(`
      CREATE TYPE "payment_issue_status_enum" AS ENUM ('open', 'resolved')
    `);

    await queryRunner.query(`
      CREATE TABLE "payment_issues" (
        "id"             UUID                        NOT NULL DEFAULT uuid_generate_v4(),
        "type"           "payment_issue_type_enum"   NOT NULL,
        "status"         "payment_issue_status_enum" NOT NULL DEFAULT 'open',
        "payment_id"     UUID,
        "order_id"       UUID,
        "method"         "payment_method_enum",
        "summary"        TEXT                        NOT NULL,
        "details"        JSONB,
        "resolvedBy"     UUID,
        "resolvedAt"     TIMESTAMPTZ,
        "resolutionNote" TEXT,
        "createdAt"      TIMESTAMPTZ                 NOT NULL DEFAULT now(),
        "updatedAt"      TIMESTAMPTZ                 NOT NULL DEFAULT now(),
        CONSTRAINT "PK_payment_issues" PRIMARY KEY ("id"),
        CONSTRAINT "FK_payment_issues_payment_id"
          FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_payment_issues_order_id"
          FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_payment_issues_status_created"
        ON "payment_issues" ("status", "createdAt")
    `);
    // Reconciliation re-raises on every pass; this makes the repeat a no-op
    // (INSERT ... ON CONFLICT DO NOTHING) while the first one is open.
    await queryRunner.query(`
      CREATE UNIQUE INDEX "UQ_payment_issues_open_payment_type"
        ON "payment_issues" ("payment_id", "type")
        WHERE "status" = 'open' AND "payment_id" IS NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "payments" ADD COLUMN "reconciledAt" TIMESTAMPTZ
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "payments" DROP COLUMN "reconciledAt"`,
    );
    await queryRunner.query(`DROP TABLE "payment_issues"`);
    await queryRunner.query(`DROP TYPE "payment_issue_status_enum"`);
    await queryRunner.query(`DROP TYPE "payment_issue_type_enum"`);
  }
}
