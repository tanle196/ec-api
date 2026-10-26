import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddProductsTables1747180800000 implements MigrationInterface {
  name = 'AddProductsTables1747180800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "product_status_enum" AS ENUM ('draft', 'published', 'archived')
    `);

    await queryRunner.query(`
      CREATE TABLE "products" (
        "id"          UUID                   NOT NULL DEFAULT uuid_generate_v4(),
        "category_id" UUID                   NOT NULL,
        "name"        CHARACTER VARYING      NOT NULL,
        "slug"        CHARACTER VARYING      NOT NULL,
        "description" TEXT,
        "basePrice"   DECIMAL(12,2)          NOT NULL,
        "sku"         CHARACTER VARYING      NOT NULL,
        "status"      "product_status_enum"  NOT NULL DEFAULT 'draft',
        "isFeatured"  BOOLEAN                NOT NULL DEFAULT false,
        "createdAt"   TIMESTAMP              NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP              NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_products_slug" UNIQUE ("slug"),
        CONSTRAINT "UQ_products_sku"  UNIQUE ("sku"),
        CONSTRAINT "PK_products"      PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "products"
        ADD CONSTRAINT "FK_products_category_id"
        FOREIGN KEY ("category_id") REFERENCES "categories"("id")
        ON DELETE RESTRICT ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "product_images" (
        "id"         UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" UUID              NOT NULL,
        "url"        CHARACTER VARYING NOT NULL,
        "alt"        CHARACTER VARYING,
        "isPrimary"  BOOLEAN           NOT NULL DEFAULT false,
        "sortOrder"  INTEGER           NOT NULL DEFAULT 0,
        CONSTRAINT "PK_product_images" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "product_images"
        ADD CONSTRAINT "FK_product_images_product_id"
        FOREIGN KEY ("product_id") REFERENCES "products"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "product_variants" (
        "id"         UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "product_id" UUID              NOT NULL,
        "name"       CHARACTER VARYING NOT NULL,
        "sku"        CHARACTER VARYING NOT NULL,
        "price"      DECIMAL(12,2)     NOT NULL,
        "stock"      INTEGER           NOT NULL DEFAULT 0,
        "attributes" JSONB,
        "isActive"   BOOLEAN           NOT NULL DEFAULT true,
        "createdAt"  TIMESTAMP         NOT NULL DEFAULT now(),
        "updatedAt"  TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_product_variants_sku" UNIQUE ("sku"),
        CONSTRAINT "PK_product_variants"     PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "product_variants"
        ADD CONSTRAINT "FK_product_variants_product_id"
        FOREIGN KEY ("product_id") REFERENCES "products"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      CREATE TABLE "tags" (
        "id"   UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "name" CHARACTER VARYING NOT NULL,
        "slug" CHARACTER VARYING NOT NULL,
        CONSTRAINT "UQ_tags_name" UNIQUE ("name"),
        CONSTRAINT "UQ_tags_slug" UNIQUE ("slug"),
        CONSTRAINT "PK_tags"     PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "product_tag" (
        "product_id" UUID NOT NULL,
        "tag_id"     UUID NOT NULL,
        CONSTRAINT "PK_product_tag" PRIMARY KEY ("product_id", "tag_id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "product_tag"
        ADD CONSTRAINT "FK_product_tag_product_id"
        FOREIGN KEY ("product_id") REFERENCES "products"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(`
      ALTER TABLE "product_tag"
        ADD CONSTRAINT "FK_product_tag_tag_id"
        FOREIGN KEY ("tag_id") REFERENCES "tags"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_products_category_id" ON "products" ("category_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_products_status"      ON "products" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_products_isFeatured"  ON "products" ("isFeatured")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_images_product_id"   ON "product_images" ("product_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_variants_product_id" ON "product_variants" ("product_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_product_variants_product_id"`);
    await queryRunner.query(`DROP INDEX "IDX_product_images_product_id"`);
    await queryRunner.query(`DROP INDEX "IDX_products_isFeatured"`);
    await queryRunner.query(`DROP INDEX "IDX_products_status"`);
    await queryRunner.query(`DROP INDEX "IDX_products_category_id"`);

    await queryRunner.query(
      `ALTER TABLE "product_tag" DROP CONSTRAINT "FK_product_tag_tag_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_tag" DROP CONSTRAINT "FK_product_tag_product_id"`,
    );
    await queryRunner.query(`DROP TABLE "product_tag"`);
    await queryRunner.query(`DROP TABLE "tags"`);

    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP CONSTRAINT "FK_product_variants_product_id"`,
    );
    await queryRunner.query(`DROP TABLE "product_variants"`);

    await queryRunner.query(
      `ALTER TABLE "product_images" DROP CONSTRAINT "FK_product_images_product_id"`,
    );
    await queryRunner.query(`DROP TABLE "product_images"`);

    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_products_category_id"`,
    );
    await queryRunner.query(`DROP TABLE "products"`);
    await queryRunner.query(`DROP TYPE "product_status_enum"`);
  }
}
