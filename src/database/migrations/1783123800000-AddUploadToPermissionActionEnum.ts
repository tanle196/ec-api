import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUploadToPermissionActionEnum1783123800000 implements MigrationInterface {
  name = 'AddUploadToPermissionActionEnum1783123800000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."permission_action_enum" ADD VALUE 'upload'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres không hỗ trợ xoá 1 value khỏi enum, bỏ qua khi rollback.
  }
}
