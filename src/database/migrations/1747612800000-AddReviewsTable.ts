import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReviewsTable1747612800000 implements MigrationInterface {
  name = 'AddReviewsTable1747612800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "reviews" (
        "id"         UUID      NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"    UUID      NOT NULL,
        "product_id" UUID      NOT NULL,
        "rating"     INTEGER   NOT NULL,
        "title"      VARCHAR   NULL,
        "content"    TEXT      NULL,
        "isVerified" BOOLEAN   NOT NULL DEFAULT false,
        "isApproved" BOOLEAN   NOT NULL DEFAULT false,
        "createdAt"  TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt"  TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reviews"           PRIMARY KEY ("id"),
        CONSTRAINT "UQ_reviews_user_product" UNIQUE ("user_id", "product_id"),
        CONSTRAINT "CHK_reviews_rating"   CHECK ("rating" BETWEEN 1 AND 5)
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "reviews"
        ADD CONSTRAINT "FK_reviews_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "reviews"
        ADD CONSTRAINT "FK_reviews_product_id"
        FOREIGN KEY ("product_id") REFERENCES "products"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_reviews_product_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_reviews_user_id"`,
    );
    await queryRunner.query(`DROP TABLE "reviews"`);
  }
}
