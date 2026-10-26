import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1746057600000 implements MigrationInterface {
  name = 'InitialSchema1746057600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enums
    await queryRunner.query(`
      CREATE TYPE "public"."auth_provider_enum" AS ENUM ('local', 'google', 'facebook')
    `);

    await queryRunner.query(`
      CREATE TYPE "public"."permission_action_enum" AS ENUM (
        'create', 'read', 'update', 'delete', 'cancel', 'publish', 'assign.role'
      )
    `);

    // users
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"        UUID              NOT NULL DEFAULT uuid_generate_v4(),
        "email"     CHARACTER VARYING NOT NULL,
        "fullName"  CHARACTER VARYING,
        "avatar"    CHARACTER VARYING,
        "createdAt" TIMESTAMP         NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP         NOT NULL DEFAULT now(),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users"       PRIMARY KEY ("id")
      )
    `);

    // identities
    await queryRunner.query(`
      CREATE TABLE "identities" (
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
      ALTER TABLE "identities"
        ADD CONSTRAINT "FK_identities_userId"
        FOREIGN KEY ("userId") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE NO ACTION
    `);

    // roles
    await queryRunner.query(`
      CREATE TABLE "roles" (
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
      CREATE TABLE "permissions" (
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
      CREATE UNIQUE INDEX "IDX_permissions_module_action" ON "permissions" ("module", "action")
    `);

    // junction: user_role
    await queryRunner.query(`
      CREATE TABLE "user_role" (
        "user_id" UUID NOT NULL,
        "role_id" UUID NOT NULL,
        CONSTRAINT "PK_user_role" PRIMARY KEY ("user_id", "role_id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_user_role_user_id" ON "user_role" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_role_role_id" ON "user_role" ("role_id")`,
    );

    await queryRunner.query(`
      ALTER TABLE "user_role"
        ADD CONSTRAINT "FK_user_role_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "user_role"
        ADD CONSTRAINT "FK_user_role_role_id"
        FOREIGN KEY ("role_id") REFERENCES "roles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    `);

    // junction: user_permission
    await queryRunner.query(`
      CREATE TABLE "user_permission" (
        "user_id"       UUID NOT NULL,
        "permission_id" UUID NOT NULL,
        CONSTRAINT "PK_user_permission" PRIMARY KEY ("user_id", "permission_id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_user_permission_user_id" ON "user_permission" ("user_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_user_permission_permission_id" ON "user_permission" ("permission_id")`,
    );

    await queryRunner.query(`
      ALTER TABLE "user_permission"
        ADD CONSTRAINT "FK_user_permission_user_id"
        FOREIGN KEY ("user_id") REFERENCES "users"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "user_permission"
        ADD CONSTRAINT "FK_user_permission_permission_id"
        FOREIGN KEY ("permission_id") REFERENCES "permissions"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    `);

    // junction: role_permission
    await queryRunner.query(`
      CREATE TABLE "role_permission" (
        "role_id"       UUID NOT NULL,
        "permission_id" UUID NOT NULL,
        CONSTRAINT "PK_role_permission" PRIMARY KEY ("role_id", "permission_id")
      )
    `);

    await queryRunner.query(
      `CREATE INDEX "IDX_role_permission_role_id" ON "role_permission" ("role_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_role_permission_permission_id" ON "role_permission" ("permission_id")`,
    );

    await queryRunner.query(`
      ALTER TABLE "role_permission"
        ADD CONSTRAINT "FK_role_permission_role_id"
        FOREIGN KEY ("role_id") REFERENCES "roles"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    `);

    await queryRunner.query(`
      ALTER TABLE "role_permission"
        ADD CONSTRAINT "FK_role_permission_permission_id"
        FOREIGN KEY ("permission_id") REFERENCES "permissions"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // 1. Junction tables trước
    await queryRunner.query(
      `ALTER TABLE "role_permission" DROP CONSTRAINT "FK_role_permission_permission_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "role_permission" DROP CONSTRAINT "FK_role_permission_role_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_role_permission_permission_id"`);
    await queryRunner.query(`DROP INDEX "IDX_role_permission_role_id"`);
    await queryRunner.query(`DROP TABLE "role_permission"`);

    await queryRunner.query(
      `ALTER TABLE "user_permission" DROP CONSTRAINT "FK_user_permission_permission_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_permission" DROP CONSTRAINT "FK_user_permission_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_user_permission_permission_id"`);
    await queryRunner.query(`DROP INDEX "IDX_user_permission_user_id"`);
    await queryRunner.query(`DROP TABLE "user_permission"`);

    await queryRunner.query(
      `ALTER TABLE "user_role" DROP CONSTRAINT "FK_user_role_role_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_role" DROP CONSTRAINT "FK_user_role_user_id"`,
    );
    await queryRunner.query(`DROP INDEX "IDX_user_role_role_id"`);
    await queryRunner.query(`DROP INDEX "IDX_user_role_user_id"`);
    await queryRunner.query(`DROP TABLE "user_role"`);

    // 2. identities trước users (FK dependency)
    await queryRunner.query(
      `ALTER TABLE "identities" DROP CONSTRAINT "FK_identities_userId"`,
    );
    await queryRunner.query(`DROP TABLE "identities"`);

    // 3. permissions, roles, users
    await queryRunner.query(`DROP INDEX "IDX_permissions_module_action"`);
    await queryRunner.query(`DROP TABLE "permissions"`);
    await queryRunner.query(`DROP TABLE "roles"`);
    await queryRunner.query(`DROP TABLE "users"`);

    // 4. Enums cuối cùng
    await queryRunner.query(`DROP TYPE "public"."permission_action_enum"`);
    await queryRunner.query(`DROP TYPE "public"."auth_provider_enum"`);
  }
}
