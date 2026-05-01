import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1746057600000 implements MigrationInterface {
  name = 'InitialSchema1746057600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enums
    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."auth_provider_enum" AS ENUM ('local', 'google', 'facebook');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE "public"."permission_action_enum" AS ENUM (
          'create', 'read', 'update', 'delete', 'cancel', 'publish', 'assign.role'
        );
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // users
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "users" (
        "id"         UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "email"      CHARACTER VARYING NOT NULL,
        "fullName"   CHARACTER VARYING,
        "avatar"     CHARACTER VARYING,
        "createdAt"  TIMESTAMP         NOT NULL DEFAULT now(),
        "updatedAt"  TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users"       PRIMARY KEY ("id")
      )
    `);

    // identities
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "identities" (
        "id"                       UUID                           NOT NULL DEFAULT uuid_generate_v4(),
        "providerUserId"           CHARACTER VARYING,
        "provider"                 "public"."auth_provider_enum"  NOT NULL,
        "passwordHash"             CHARACTER VARYING,
        "isActive"                 BOOLEAN                        NOT NULL DEFAULT false,
        "accessToken"              TEXT,
        "refreshToken"             TEXT,
        "expiresAt"                TIMESTAMP WITH TIME ZONE,
        "verificationToken"        TEXT,
        "verificationTokenExpires" TIMESTAMP,
        "resetToken"               TEXT,
        "resetTokenExpires"        TIMESTAMP WITH TIME ZONE,
        "rawProfile"               JSONB,
        "createdAt"                TIMESTAMP                      NOT NULL DEFAULT now(),
        "updatedAt"                TIMESTAMP                      NOT NULL DEFAULT now(),
        "userId"                   UUID                           NOT NULL,
        CONSTRAINT "UQ_identities_provider_providerUserId" UNIQUE ("provider", "providerUserId"),
        CONSTRAINT "PK_identities" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "identities"
          ADD CONSTRAINT "FK_identities_userId"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // roles
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "roles" (
        "id"          UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "name"        CHARACTER VARYING NOT NULL,
        "description" CHARACTER VARYING,
        "createdAt"   TIMESTAMP         NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_roles_name" UNIQUE ("name"),
        CONSTRAINT "PK_roles"      PRIMARY KEY ("id")
      )
    `);

    // permissions
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "permissions" (
        "id"          UUID                              NOT NULL DEFAULT uuid_generate_v4(),
        "module"      CHARACTER VARYING(50)             NOT NULL,
        "action"      "public"."permission_action_enum" NOT NULL,
        "description" CHARACTER VARYING                 NOT NULL,
        "isSystem"    BOOLEAN                           NOT NULL DEFAULT false,
        "createdAt"   TIMESTAMP                         NOT NULL DEFAULT now(),
        "updatedAt"   TIMESTAMP                         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_permissions" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_permissions_module_action" ON "permissions" ("module", "action")
    `);

    // junction: user_role
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_role" (
        "user_id" UUID NOT NULL,
        "role_id" UUID NOT NULL,
        CONSTRAINT "PK_user_role" PRIMARY KEY ("user_id", "role_id")
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_role_user_id" ON "user_role" ("user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_role_role_id" ON "user_role" ("role_id")`);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "user_role"
          ADD CONSTRAINT "FK_user_role_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "user_role"
          ADD CONSTRAINT "FK_user_role_role_id"
          FOREIGN KEY ("role_id") REFERENCES "roles"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // junction: user_permission
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_permission" (
        "user_id"       UUID NOT NULL,
        "permission_id" UUID NOT NULL,
        CONSTRAINT "PK_user_permission" PRIMARY KEY ("user_id", "permission_id")
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_permission_user_id" ON "user_permission" ("user_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_user_permission_permission_id" ON "user_permission" ("permission_id")`);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "user_permission"
          ADD CONSTRAINT "FK_user_permission_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "user_permission"
          ADD CONSTRAINT "FK_user_permission_permission_id"
          FOREIGN KEY ("permission_id") REFERENCES "permissions"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    // junction: role_permission
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "role_permission" (
        "role_id"       UUID NOT NULL,
        "permission_id" UUID NOT NULL,
        CONSTRAINT "PK_role_permission" PRIMARY KEY ("role_id", "permission_id")
      )
    `);

    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_role_permission_role_id" ON "role_permission" ("role_id")`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IDX_role_permission_permission_id" ON "role_permission" ("permission_id")`);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "role_permission"
          ADD CONSTRAINT "FK_role_permission_role_id"
          FOREIGN KEY ("role_id") REFERENCES "roles"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      DO $$ BEGIN
        ALTER TABLE "role_permission"
          ADD CONSTRAINT "FK_role_permission_permission_id"
          FOREIGN KEY ("permission_id") REFERENCES "permissions"("id")
          ON DELETE CASCADE ON UPDATE CASCADE;
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "role_permission" DROP CONSTRAINT IF EXISTS "FK_role_permission_permission_id"`);
    await queryRunner.query(`ALTER TABLE "role_permission" DROP CONSTRAINT IF EXISTS "FK_role_permission_role_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_role_permission_permission_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_role_permission_role_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "role_permission"`);

    await queryRunner.query(`ALTER TABLE "user_permission" DROP CONSTRAINT IF EXISTS "FK_user_permission_permission_id"`);
    await queryRunner.query(`ALTER TABLE "user_permission" DROP CONSTRAINT IF EXISTS "FK_user_permission_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_permission_permission_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_permission_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_permission"`);

    await queryRunner.query(`ALTER TABLE "user_role" DROP CONSTRAINT IF EXISTS "FK_user_role_role_id"`);
    await queryRunner.query(`ALTER TABLE "user_role" DROP CONSTRAINT IF EXISTS "FK_user_role_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_role_role_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_user_role_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_role"`);

    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_permissions_module_action"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "permissions"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "roles"`);

    await queryRunner.query(`ALTER TABLE "identities" DROP CONSTRAINT IF EXISTS "FK_identities_userId"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "identities"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);

    await queryRunner.query(`DROP TYPE IF EXISTS "public"."permission_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "public"."auth_provider_enum"`);
  }
}
