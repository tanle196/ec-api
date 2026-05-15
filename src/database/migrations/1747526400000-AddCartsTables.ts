import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCartsTables1747526400000 implements MigrationInterface {
  name = 'AddCartsTables1747526400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "carts" (
        "id"        UUID      NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"   UUID      NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_carts" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_carts_user_id" UNIQUE ("user_id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "carts"
        ADD CONSTRAINT "FK_carts_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "cart_items" (
        "id"         UUID      NOT NULL DEFAULT uuid_generate_v4(),
        "cart_id"    UUID      NOT NULL,
        "variant_id" UUID      NOT NULL,
        "quantity"   INTEGER   NOT NULL DEFAULT 1,
        "createdAt"  TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"  TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cart_items" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "cart_items"
        ADD CONSTRAINT "FK_cart_items_cart_id"
        FOREIGN KEY ("cart_id") REFERENCES "carts"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "cart_items"
        ADD CONSTRAINT "FK_cart_items_variant_id"
        FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "FK_cart_items_variant_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "FK_cart_items_cart_id"`,
    );
    await queryRunner.query(`DROP TABLE "cart_items"`);
    await queryRunner.query(
      `ALTER TABLE "carts" DROP CONSTRAINT "FK_carts_user_id"`,
    );
    await queryRunner.query(`DROP TABLE "carts"`);
  }
}
