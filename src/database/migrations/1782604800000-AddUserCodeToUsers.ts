import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUserCodeToUsers1782604800000 implements MigrationInterface {
  name = 'AddUserCodeToUsers1782604800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD "userCode" character varying`,
    );

    await queryRunner.query(`
      UPDATE "users"
      SET "userCode" = 'USR-' || TO_CHAR("createdAt", 'YYYYMMDD') || '-' || UPPER(SUBSTRING(MD5(id::TEXT), 1, 6))
      WHERE "userCode" IS NULL
    `);

    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "userCode" SET NOT NULL`,
    );

    await queryRunner.query(
      `CREATE UNIQUE INDEX "UQ_users_userCode" ON "users" ("userCode")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "UQ_users_userCode"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "userCode"`);
  }
}
