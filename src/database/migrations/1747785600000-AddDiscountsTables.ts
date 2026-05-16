import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDiscountsTables1747785600000 implements MigrationInterface {
  name = 'AddDiscountsTables1747785600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "discount_type_enum" AS ENUM ('percent', 'fixed')
    `);

    await queryRunner.query(`
      CREATE TABLE "discounts" (
        "id"            UUID                   NOT NULL DEFAULT uuid_generate_v4(),
        "code"          CHARACTER VARYING      NOT NULL,
        "type"          "discount_type_enum"   NOT NULL,
        "value"         NUMERIC(10,2)          NOT NULL,
        "minOrderValue" NUMERIC(12,2),
        "usageLimit"    INTEGER,
        "usedCount"     INTEGER                NOT NULL DEFAULT 0,
        "isActive"      BOOLEAN                NOT NULL DEFAULT true,
        "startsAt"      TIMESTAMP,
        "expiresAt"     TIMESTAMP,
        "createdAt"     TIMESTAMP              NOT NULL DEFAULT now(),
        "updatedAt"     TIMESTAMP              NOT NULL DEFAULT now(),
        CONSTRAINT "PK_discounts"      PRIMARY KEY ("id"),
        CONSTRAINT "UQ_discounts_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "order_discount" (
        "order_id"    UUID NOT NULL,
        "discount_id" UUID NOT NULL,
        CONSTRAINT "PK_order_discount" PRIMARY KEY ("order_id", "discount_id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "order_discount"
        ADD CONSTRAINT "FK_order_discount_order_id"
        FOREIGN KEY ("order_id") REFERENCES "orders"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "order_discount"
        ADD CONSTRAINT "FK_order_discount_discount_id"
        FOREIGN KEY ("discount_id") REFERENCES "discounts"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_discount" DROP CONSTRAINT "FK_order_discount_discount_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_discount" DROP CONSTRAINT "FK_order_discount_order_id"`,
    );
    await queryRunner.query(`DROP TABLE "order_discount"`);
    await queryRunner.query(`DROP TABLE "discounts"`);
    await queryRunner.query(`DROP TYPE "discount_type_enum"`);
  }
}
