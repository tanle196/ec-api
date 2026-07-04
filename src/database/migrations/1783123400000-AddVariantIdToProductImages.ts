import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddVariantIdToProductImages1783123400000
  implements MigrationInterface
{
  name = 'AddVariantIdToProductImages1783123400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_images" ADD "variant_id" uuid`,
    );

    await queryRunner.query(
      `ALTER TABLE "product_images"
        ADD CONSTRAINT "FK_product_images_variant_id"
        FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id")
        ON DELETE SET NULL`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_product_images_variant_id" ON "product_images" ("variant_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_product_images_variant_id"`);
    await queryRunner.query(
      `ALTER TABLE "product_images" DROP CONSTRAINT "FK_product_images_variant_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_images" DROP COLUMN "variant_id"`,
    );
  }
}
