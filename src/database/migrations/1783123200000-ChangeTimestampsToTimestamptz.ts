import { MigrationInterface, QueryRunner } from 'typeorm';

const TABLES = [
  'users',
  'products',
  'product_variants',
  'orders',
  'payments',
  'identities',
  'discounts',
  'roles',
  'permissions',
  'banners',
  'carts',
  'cart_items',
  'addresses',
  'categories',
  'reviews',
];

export class ChangeTimestampsToTimestamptz1783123200000 implements MigrationInterface {
  name = 'ChangeTimestampsToTimestamptz1783123200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ALTER COLUMN "createdAt" TYPE TIMESTAMPTZ USING "createdAt" AT TIME ZONE 'UTC',
          ALTER COLUMN "updatedAt" TYPE TIMESTAMPTZ USING "updatedAt" AT TIME ZONE 'UTC'
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of TABLES) {
      await queryRunner.query(`
        ALTER TABLE "${table}"
          ALTER COLUMN "createdAt" TYPE TIMESTAMP USING "createdAt" AT TIME ZONE 'UTC',
          ALTER COLUMN "updatedAt" TYPE TIMESTAMP USING "updatedAt" AT TIME ZONE 'UTC'
      `);
    }
  }
}
