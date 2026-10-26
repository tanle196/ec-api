import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAddressesTable1747267200000 implements MigrationInterface {
  name = 'AddAddressesTable1747267200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "addresses" (
        "id"           UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"      UUID              NOT NULL,
        "fullName"     CHARACTER VARYING NOT NULL,
        "phone"        CHARACTER VARYING NOT NULL,
        "addressLine1" CHARACTER VARYING NOT NULL,
        "addressLine2" CHARACTER VARYING,
        "city"         CHARACTER VARYING NOT NULL,
        "province"     CHARACTER VARYING NOT NULL,
        "country"      CHARACTER VARYING NOT NULL DEFAULT 'VN',
        "postalCode"   CHARACTER VARYING,
        "isDefault"    BOOLEAN           NOT NULL DEFAULT false,
        "createdAt"    TIMESTAMP         NOT NULL DEFAULT now(),
        "updatedAt"    TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_addresses" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      ALTER TABLE "addresses"
        ADD CONSTRAINT "FK_addresses_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "addresses" DROP CONSTRAINT "FK_addresses_user_id"`,
    );
    await queryRunner.query(`DROP TABLE "addresses"`);
  }
}
