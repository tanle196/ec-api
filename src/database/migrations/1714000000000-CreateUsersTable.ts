import { MigrationInterface, QueryRunner, Table } from 'typeorm';

export class CreateUsersTable1714000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          {
            name: 'id',
            type: 'int',
            isPrimary: true,
            isGenerated: true,
            generationStrategy: 'increment',
          },
          { name: 'full_name', type: 'varchar', length: '150' },
          { name: 'email', type: 'varchar', length: '255', isUnique: true },
          { name: 'password', type: 'varchar', length: '255' },
          { name: 'phone', type: 'varchar', length: '20', isNullable: true },
          { name: 'address', type: 'text', isNullable: true },
          {
            name: 'role',
            type: 'varchar',
            length: '20',
            default: "'customer'",
          },
          { name: 'is_active', type: 'boolean', default: true },
          {
            name: 'created_at',
            type: 'timestamp',
            default: 'now()',
          },
          {
            name: 'updated_at',
            type: 'timestamp',
            default: 'now()',
          },
        ],
      }),
      true,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users');
  }
}
