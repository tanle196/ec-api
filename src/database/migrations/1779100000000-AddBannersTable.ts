import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBannersTable1779100000000 implements MigrationInterface {
  name = 'AddBannersTable1779100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "banner_position_enum" AS ENUM ('hero', 'promo_strip', 'mid_page', 'popup')
    `);

    await queryRunner.query(`
      CREATE TYPE "banner_link_type_enum" AS ENUM ('url', 'product', 'category', 'discount')
    `);

    await queryRunner.query(`
      CREATE TABLE "banners" (
        "id"                   UUID                        NOT NULL DEFAULT uuid_generate_v4(),
        "title"                CHARACTER VARYING           NOT NULL,
        "subtitle"             CHARACTER VARYING,
        "position"             "banner_position_enum"      NOT NULL DEFAULT 'hero',
        "imageUrl"             CHARACTER VARYING           NOT NULL,
        "imageMobileUrl"       CHARACTER VARYING,
        "imagePublicId"        CHARACTER VARYING,
        "imageMobilePublicId"  CHARACTER VARYING,
        "linkType"             "banner_link_type_enum"     NOT NULL DEFAULT 'url',
        "linkValue"            CHARACTER VARYING,
        "sortOrder"            INTEGER                     NOT NULL DEFAULT 0,
        "isActive"             BOOLEAN                     NOT NULL DEFAULT true,
        "startsAt"             TIMESTAMP,
        "endsAt"               TIMESTAMP,
        "clickCount"           INTEGER                     NOT NULL DEFAULT 0,
        "createdAt"            TIMESTAMP                   NOT NULL DEFAULT now(),
        "updatedAt"            TIMESTAMP                   NOT NULL DEFAULT now(),
        CONSTRAINT "PK_banners" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_banners_position_isActive" ON "banners" ("position", "isActive")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_banners_position_isActive"`);
    await queryRunner.query(`DROP TABLE "banners"`);
    await queryRunner.query(`DROP TYPE "banner_link_type_enum"`);
    await queryRunner.query(`DROP TYPE "banner_position_enum"`);
  }
}
