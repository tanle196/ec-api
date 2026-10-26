import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrdersTables1747353600000 implements MigrationInterface {
  name = 'AddOrdersTables1747353600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "order_status_enum" AS ENUM (
        'pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id"          UUID                NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"     UUID                NOT NULL,
        "address_id"  UUID,
        "orderNumber" CHARACTER VARYING   NOT NULL,
        "status"      "order_status_enum" NOT NULL DEFAULT 'pending',
        "subtotal"    NUMERIC(12,2)       NOT NULL,
        "shippingFee" NUMERIC(12,2)       NOT NULL DEFAULT 0,
        "discount"    NUMERIC(12,2)       NOT NULL DEFAULT 0,
        "total"       NUMERIC(12,2)       NOT NULL,
        "notes"       TEXT,
        "createdAt"   TIMESTAMP           NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP           NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_orders_orderNumber" UNIQUE ("orderNumber")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD CONSTRAINT "FK_orders_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "orders"
        ADD CONSTRAINT "FK_orders_address_id"
        FOREIGN KEY ("address_id") REFERENCES "addresses"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "order_items" (
        "id"          UUID          NOT NULL DEFAULT uuid_generate_v4(),
        "order_id"    UUID          NOT NULL,
        "variant_id"  UUID,
        "productName" CHARACTER VARYING NOT NULL,
        "variantName" CHARACTER VARYING,
        "unitPrice"   NUMERIC(12,2) NOT NULL,
        "quantity"    INTEGER       NOT NULL,
        "total"       NUMERIC(12,2) NOT NULL,
        CONSTRAINT "PK_order_items" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items"
        ADD CONSTRAINT "FK_order_items_order_id"
        FOREIGN KEY ("order_id") REFERENCES "orders"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "order_items"
        ADD CONSTRAINT "FK_order_items_variant_id"
        FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_order_items_variant_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_order_items_order_id"`,
    );
    await queryRunner.query(`DROP TABLE "order_items"`);
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_address_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_user_id"`,
    );
    await queryRunner.query(`DROP TABLE "orders"`);
    await queryRunner.query(`DROP TYPE "order_status_enum"`);
  }
}
