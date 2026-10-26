import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPublicIdToImages1779015266860 implements MigrationInterface {
  name = 'AddPublicIdToImages1779015266860';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "categories" ADD "imagePublicId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_images" ADD "publicId" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "product_images" DROP COLUMN "publicId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP COLUMN "imagePublicId"`,
    );
  }
}
