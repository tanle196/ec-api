import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWishlistsTable1747699200000 implements MigrationInterface {
  name = 'AddWishlistsTable1747699200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "wishlists" (
        "id"         UUID      NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"    UUID      NOT NULL,
        "product_id" UUID      NOT NULL,
        "createdAt"  TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wishlists"             PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wishlists_user_product" UNIQUE ("user_id", "product_id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "wishlists"
        ADD CONSTRAINT "FK_wishlists_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "wishlists"
        ADD CONSTRAINT "FK_wishlists_product_id"
        FOREIGN KEY ("product_id") REFERENCES "products"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "wishlists" DROP CONSTRAINT "FK_wishlists_product_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" DROP CONSTRAINT "FK_wishlists_user_id"`,
    );
    await queryRunner.query(`DROP TABLE "wishlists"`);
  }
}
