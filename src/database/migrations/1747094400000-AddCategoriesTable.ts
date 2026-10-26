import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddCategoriesTable1747094400000 implements MigrationInterface {
  name = 'AddCategoriesTable1747094400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "categories" (
        "id"          UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "parent_id"   UUID,
        "name"        CHARACTER VARYING NOT NULL,
        "slug"        CHARACTER VARYING NOT NULL,
        "description" TEXT,
        "image"       CHARACTER VARYING,
        "sortOrder"   INTEGER           NOT NULL DEFAULT 0,
        "isActive"    BOOLEAN           NOT NULL DEFAULT true,
        "createdAt"   TIMESTAMP         NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_categories_slug"  UNIQUE ("slug"),
        CONSTRAINT "PK_categories"       PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "categories"
        ADD CONSTRAINT "FK_categories_parent_id"
        FOREIGN KEY ("parent_id") REFERENCES "categories"("id")
        ON DELETE SET NULL ON UPDATE NO ACTION
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_categories_parent_id" ON "categories" ("parent_id")`,
    );

    await queryRunner.query(
      `CREATE INDEX "IDX_categories_isActive" ON "categories" ("isActive")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_categories_isActive"`);
    await queryRunner.query(`DROP INDEX "IDX_categories_parent_id"`);
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "FK_categories_parent_id"`,
    );
    await queryRunner.query(`DROP TABLE "categories"`);
  }
}
