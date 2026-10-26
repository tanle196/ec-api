import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignWishlistsTimestamps1783123300000 implements MigrationInterface {
  name = 'AlignWishlistsTimestamps1783123300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "wishlists"
        ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ USING "createdAt" AT TIME ZONE 'UTC'
    `);

    await queryRunner.query(`
      ALTER TABLE "wishlists"
        ADD COLUMN "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "wishlists" DROP COLUMN "updatedAt"
    `);

    await queryRunner.query(`
      ALTER TABLE "wishlists"
        ALTER COLUMN "createdAt" TYPE TIMESTAMP USING "createdAt" AT TIME ZONE 'UTC'
    `);
  }
}
