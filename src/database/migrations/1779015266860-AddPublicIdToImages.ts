import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPublicIdToImages1779015266860 implements MigrationInterface {
  name = 'AddPublicIdToImages1779015266860';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "identities" DROP CONSTRAINT "FK_identities_userId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "addresses" DROP CONSTRAINT "FK_addresses_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "FK_categories_parent_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_images" DROP CONSTRAINT "FK_product_images_product_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP CONSTRAINT "FK_product_variants_product_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_products_category_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" DROP CONSTRAINT "FK_wishlists_product_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" DROP CONSTRAINT "FK_wishlists_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_reviews_product_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_reviews_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_order_items_variant_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_order_items_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_address_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_orders_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_payments_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "FK_cart_items_variant_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "FK_cart_items_cart_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "carts" DROP CONSTRAINT "FK_carts_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permission" DROP CONSTRAINT "FK_role_permission_permission_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permission" DROP CONSTRAINT "FK_role_permission_role_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_role" DROP CONSTRAINT "FK_user_role_role_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_role" DROP CONSTRAINT "FK_user_role_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_permission" DROP CONSTRAINT "FK_user_permission_permission_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_permission" DROP CONSTRAINT "FK_user_permission_user_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_tag" DROP CONSTRAINT "FK_product_tag_tag_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_tag" DROP CONSTRAINT "FK_product_tag_product_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_discount" DROP CONSTRAINT "FK_order_discount_discount_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_discount" DROP CONSTRAINT "FK_order_discount_order_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_permissions_module_action"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_categories_parent_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_categories_isActive"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_product_images_product_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_product_variants_product_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_products_category_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_products_status"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_products_isFeatured"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_role_permission_role_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_role_permission_permission_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_user_role_user_id"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_user_role_role_id"`);
    await queryRunner.query(
      `DROP INDEX "public"."IDX_user_permission_user_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_user_permission_permission_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "CHK_reviews_rating"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identities" DROP CONSTRAINT "UQ_identities_provider_providerUserId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" DROP CONSTRAINT "UQ_wishlists_user_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "UQ_reviews_user_product"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" ADD "imagePublicId" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_images" ADD "publicId" character varying`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."auth_provider_enum" RENAME TO "auth_provider_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."identities_provider_enum" AS ENUM('local', 'google', 'facebook')`,
    );
    await queryRunner.query(
      `ALTER TABLE "identities" ALTER COLUMN "provider" TYPE "public"."identities_provider_enum" USING "provider"::"text"::"public"."identities_provider_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."auth_provider_enum_old"`);
    await queryRunner.query(
      `ALTER TYPE "public"."product_status_enum" RENAME TO "product_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."products_status_enum" AS ENUM('draft', 'published', 'archived')`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ALTER COLUMN "status" TYPE "public"."products_status_enum" USING "status"::"text"::"public"."products_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ALTER COLUMN "status" SET DEFAULT 'draft'`,
    );
    await queryRunner.query(`DROP TYPE "public"."product_status_enum_old"`);
    await queryRunner.query(
      `ALTER TYPE "public"."discount_type_enum" RENAME TO "discount_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."discounts_type_enum" AS ENUM('percent', 'fixed')`,
    );
    await queryRunner.query(
      `ALTER TABLE "discounts" ALTER COLUMN "type" TYPE "public"."discounts_type_enum" USING "type"::"text"::"public"."discounts_type_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."discount_type_enum_old"`);
    await queryRunner.query(
      `ALTER TYPE "public"."order_status_enum" RENAME TO "order_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."orders_status_enum" AS ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" TYPE "public"."orders_status_enum" USING "status"::"text"::"public"."orders_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending'`,
    );
    await queryRunner.query(`DROP TYPE "public"."order_status_enum_old"`);
    await queryRunner.query(
      `ALTER TYPE "public"."payment_method_enum" RENAME TO "payment_method_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_method_enum" AS ENUM('cod', 'vnpay', 'momo', 'zalopay', 'stripe', 'bank_transfer')`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "method" TYPE "public"."payments_method_enum" USING "method"::"text"::"public"."payments_method_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."payment_method_enum_old"`);
    await queryRunner.query(
      `ALTER TYPE "public"."payment_status_enum" RENAME TO "payment_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payments_status_enum" AS ENUM('pending', 'completed', 'failed', 'refunded')`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "status" TYPE "public"."payments_status_enum" USING "status"::"text"::"public"."payments_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'pending'`,
    );
    await queryRunner.query(`DROP TYPE "public"."payment_status_enum_old"`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_35ddf0f00aaedd9b4bd19f1f49" ON "permissions" ("module", "action") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_3d0a7155eafd75ddba5a701336" ON "role_permission" ("role_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_e3a3ba47b7ca00fd23be4ebd6c" ON "role_permission" ("permission_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d0e5815877f7395a198a4cb0a4" ON "user_role" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_32a6fc2fcb019d8e3a8ace0f55" ON "user_role" ("role_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_2305dfa7330dd7f8e211f4f35d" ON "user_permission" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_8a4d5521c1ced158c13438df3d" ON "user_permission" ("permission_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_d08cb260c60a9bf0a5e0424768" ON "product_tag" ("product_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_7bf0b673c19b33c9456d54b2b3" ON "product_tag" ("tag_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_acb8e88df0e9b1287d39c3d2d7" ON "order_discount" ("order_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_866b135249451c9981c2f58517" ON "order_discount" ("discount_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "identities" ADD CONSTRAINT "UQ_79d916ccc6f496d5432373f9b8d" UNIQUE ("provider", "providerUserId")`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" ADD CONSTRAINT "UQ_9c64a981c56ba677ac17f5fba6f" UNIQUE ("user_id", "product_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "UQ_43968e5855f331f4f1355a3fb27" UNIQUE ("user_id", "product_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "identities" ADD CONSTRAINT "FK_3144d31adb77f8fdd5aecf28f4a" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "addresses" ADD CONSTRAINT "FK_16aac8a9f6f9c1dd6bcb75ec023" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" ADD CONSTRAINT "FK_88cea2dc9c31951d06437879b40" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_images" ADD CONSTRAINT "FK_4f166bb8c2bfcef2498d97b4068" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD CONSTRAINT "FK_6343513e20e2deab45edfce1316" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_9a5f6868c96e0069e699f33e124" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" ADD CONSTRAINT "FK_b5e6331a1a7d61c25d7a25cab8f" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" ADD CONSTRAINT "FK_2662acbb3868b1f0077fda61dd2" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_728447781a30bc3fcfe5c2f1cdf" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_9482e9567d8dcc2bc615981ef44" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_145532db85752b29c57d2b7b1f1" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_db2d0ea722e16e0fe8ab3bce111" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_a922b820eeef29ac1c6800e826a" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_d39c53244703b8534307adcd073" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_b2f7b823a21562eeca20e72b006" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "FK_6385a745d9e12a89b859bb25623" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "FK_ede780fc2b865d1d1323e598038" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "carts" ADD CONSTRAINT "FK_2ec1c94a977b940d85a4f498aea" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permission" ADD CONSTRAINT "FK_3d0a7155eafd75ddba5a7013368" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permission" ADD CONSTRAINT "FK_e3a3ba47b7ca00fd23be4ebd6cf" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_role" ADD CONSTRAINT "FK_d0e5815877f7395a198a4cb0a46" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_role" ADD CONSTRAINT "FK_32a6fc2fcb019d8e3a8ace0f55f" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_permission" ADD CONSTRAINT "FK_2305dfa7330dd7f8e211f4f35d9" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_permission" ADD CONSTRAINT "FK_8a4d5521c1ced158c13438df3df" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_tag" ADD CONSTRAINT "FK_d08cb260c60a9bf0a5e0424768d" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_tag" ADD CONSTRAINT "FK_7bf0b673c19b33c9456d54b2b37" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_discount" ADD CONSTRAINT "FK_acb8e88df0e9b1287d39c3d2d7c" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_discount" ADD CONSTRAINT "FK_866b135249451c9981c2f585178" FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "order_discount" DROP CONSTRAINT "FK_866b135249451c9981c2f585178"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_discount" DROP CONSTRAINT "FK_acb8e88df0e9b1287d39c3d2d7c"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_tag" DROP CONSTRAINT "FK_7bf0b673c19b33c9456d54b2b37"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_tag" DROP CONSTRAINT "FK_d08cb260c60a9bf0a5e0424768d"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_permission" DROP CONSTRAINT "FK_8a4d5521c1ced158c13438df3df"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_permission" DROP CONSTRAINT "FK_2305dfa7330dd7f8e211f4f35d9"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_role" DROP CONSTRAINT "FK_32a6fc2fcb019d8e3a8ace0f55f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_role" DROP CONSTRAINT "FK_d0e5815877f7395a198a4cb0a46"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permission" DROP CONSTRAINT "FK_e3a3ba47b7ca00fd23be4ebd6cf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permission" DROP CONSTRAINT "FK_3d0a7155eafd75ddba5a7013368"`,
    );
    await queryRunner.query(
      `ALTER TABLE "carts" DROP CONSTRAINT "FK_2ec1c94a977b940d85a4f498aea"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "FK_ede780fc2b865d1d1323e598038"`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" DROP CONSTRAINT "FK_6385a745d9e12a89b859bb25623"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" DROP CONSTRAINT "FK_b2f7b823a21562eeca20e72b006"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_d39c53244703b8534307adcd073"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" DROP CONSTRAINT "FK_a922b820eeef29ac1c6800e826a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_db2d0ea722e16e0fe8ab3bce111"`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" DROP CONSTRAINT "FK_145532db85752b29c57d2b7b1f1"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_9482e9567d8dcc2bc615981ef44"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "FK_728447781a30bc3fcfe5c2f1cdf"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" DROP CONSTRAINT "FK_2662acbb3868b1f0077fda61dd2"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" DROP CONSTRAINT "FK_b5e6331a1a7d61c25d7a25cab8f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" DROP CONSTRAINT "FK_9a5f6868c96e0069e699f33e124"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" DROP CONSTRAINT "FK_6343513e20e2deab45edfce1316"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_images" DROP CONSTRAINT "FK_4f166bb8c2bfcef2498d97b4068"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP CONSTRAINT "FK_88cea2dc9c31951d06437879b40"`,
    );
    await queryRunner.query(
      `ALTER TABLE "addresses" DROP CONSTRAINT "FK_16aac8a9f6f9c1dd6bcb75ec023"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identities" DROP CONSTRAINT "FK_3144d31adb77f8fdd5aecf28f4a"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" DROP CONSTRAINT "UQ_43968e5855f331f4f1355a3fb27"`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" DROP CONSTRAINT "UQ_9c64a981c56ba677ac17f5fba6f"`,
    );
    await queryRunner.query(
      `ALTER TABLE "identities" DROP CONSTRAINT "UQ_79d916ccc6f496d5432373f9b8d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_866b135249451c9981c2f58517"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_acb8e88df0e9b1287d39c3d2d7"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_7bf0b673c19b33c9456d54b2b3"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d08cb260c60a9bf0a5e0424768"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_8a4d5521c1ced158c13438df3d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_2305dfa7330dd7f8e211f4f35d"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_32a6fc2fcb019d8e3a8ace0f55"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_d0e5815877f7395a198a4cb0a4"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_e3a3ba47b7ca00fd23be4ebd6c"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_3d0a7155eafd75ddba5a701336"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_35ddf0f00aaedd9b4bd19f1f49"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payment_status_enum_old" AS ENUM('pending', 'completed', 'failed', 'refunded')`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "status" TYPE "public"."payment_status_enum_old" USING "status"::"text"::"public"."payment_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "status" SET DEFAULT 'pending'`,
    );
    await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."payment_status_enum_old" RENAME TO "payment_status_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."payment_method_enum_old" AS ENUM('cod', 'vnpay', 'momo', 'zalopay', 'stripe', 'bank_transfer')`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ALTER COLUMN "method" TYPE "public"."payment_method_enum_old" USING "method"::"text"::"public"."payment_method_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."payments_method_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."payment_method_enum_old" RENAME TO "payment_method_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."order_status_enum_old" AS ENUM('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" TYPE "public"."order_status_enum_old" USING "status"::"text"::"public"."order_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ALTER COLUMN "status" SET DEFAULT 'pending'`,
    );
    await queryRunner.query(`DROP TYPE "public"."orders_status_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."order_status_enum_old" RENAME TO "order_status_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."discount_type_enum_old" AS ENUM('percent', 'fixed')`,
    );
    await queryRunner.query(
      `ALTER TABLE "discounts" ALTER COLUMN "type" TYPE "public"."discount_type_enum_old" USING "type"::"text"::"public"."discount_type_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."discounts_type_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."discount_type_enum_old" RENAME TO "discount_type_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."product_status_enum_old" AS ENUM('draft', 'published', 'archived')`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ALTER COLUMN "status" TYPE "public"."product_status_enum_old" USING "status"::"text"::"public"."product_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ALTER COLUMN "status" SET DEFAULT 'draft'`,
    );
    await queryRunner.query(`DROP TYPE "public"."products_status_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."product_status_enum_old" RENAME TO "product_status_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."auth_provider_enum_old" AS ENUM('local', 'google', 'facebook')`,
    );
    await queryRunner.query(
      `ALTER TABLE "identities" ALTER COLUMN "provider" TYPE "public"."auth_provider_enum_old" USING "provider"::"text"::"public"."auth_provider_enum_old"`,
    );
    await queryRunner.query(`DROP TYPE "public"."identities_provider_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."auth_provider_enum_old" RENAME TO "auth_provider_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_images" DROP COLUMN "publicId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" DROP COLUMN "imagePublicId"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "UQ_reviews_user_product" UNIQUE ("user_id", "product_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" ADD CONSTRAINT "UQ_wishlists_user_product" UNIQUE ("user_id", "product_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "identities" ADD CONSTRAINT "UQ_identities_provider_providerUserId" UNIQUE ("providerUserId", "provider")`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "CHK_reviews_rating" CHECK (((rating >= 1) AND (rating <= 5)))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_permission_permission_id" ON "user_permission" ("permission_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_permission_user_id" ON "user_permission" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_role_role_id" ON "user_role" ("role_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_role_user_id" ON "user_role" ("user_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_role_permission_permission_id" ON "role_permission" ("permission_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_role_permission_role_id" ON "role_permission" ("role_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_products_isFeatured" ON "products" ("isFeatured") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_products_status" ON "products" ("status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_products_category_id" ON "products" ("category_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_variants_product_id" ON "product_variants" ("product_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_product_images_product_id" ON "product_images" ("product_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_categories_isActive" ON "categories" ("isActive") `,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_categories_parent_id" ON "categories" ("parent_id") `,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_permissions_module_action" ON "permissions" ("action", "module") `,
    );
    await queryRunner.query(
      `ALTER TABLE "order_discount" ADD CONSTRAINT "FK_order_discount_order_id" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_discount" ADD CONSTRAINT "FK_order_discount_discount_id" FOREIGN KEY ("discount_id") REFERENCES "discounts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_tag" ADD CONSTRAINT "FK_product_tag_product_id" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_tag" ADD CONSTRAINT "FK_product_tag_tag_id" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_permission" ADD CONSTRAINT "FK_user_permission_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_permission" ADD CONSTRAINT "FK_user_permission_permission_id" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_role" ADD CONSTRAINT "FK_user_role_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_role" ADD CONSTRAINT "FK_user_role_role_id" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permission" ADD CONSTRAINT "FK_role_permission_role_id" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permission" ADD CONSTRAINT "FK_role_permission_permission_id" FOREIGN KEY ("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE`,
    );
    await queryRunner.query(
      `ALTER TABLE "carts" ADD CONSTRAINT "FK_carts_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "FK_cart_items_cart_id" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "cart_items" ADD CONSTRAINT "FK_cart_items_variant_id" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "payments" ADD CONSTRAINT "FK_payments_order_id" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "orders" ADD CONSTRAINT "FK_orders_address_id" FOREIGN KEY ("address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_order_items_order_id" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "order_items" ADD CONSTRAINT "FK_order_items_variant_id" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_reviews_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "reviews" ADD CONSTRAINT "FK_reviews_product_id" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" ADD CONSTRAINT "FK_wishlists_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "wishlists" ADD CONSTRAINT "FK_wishlists_product_id" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "products" ADD CONSTRAINT "FK_products_category_id" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_variants" ADD CONSTRAINT "FK_product_variants_product_id" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "product_images" ADD CONSTRAINT "FK_product_images_product_id" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "categories" ADD CONSTRAINT "FK_categories_parent_id" FOREIGN KEY ("parent_id") REFERENCES "categories"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "addresses" ADD CONSTRAINT "FK_addresses_user_id" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "identities" ADD CONSTRAINT "FK_identities_userId" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
