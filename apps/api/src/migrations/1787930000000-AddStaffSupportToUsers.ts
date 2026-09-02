import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddStaffSupportToUsers1787930000000
  implements MigrationInterface
{
  name = 'AddStaffSupportToUsers1787930000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."users_role_enum" ADD VALUE IF NOT EXISTS 'staff'`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."users_staff_role_enum" AS ENUM('manager', 'cashier', 'staff')`,
    );
    await queryRunner.query(`ALTER TABLE "users" ADD "owner_id" uuid`);
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "FK_users_owner_id" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD "staff_role" "public"."users_staff_role_enum"`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3"`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "users_email_unique_idx" ON "users" ("email") WHERE "email" IS NOT NULL`,
    );

    // Existing phone values were never enforced unique — dedupe before adding
    // the partial unique index (keep the earliest row per phone, null the rest).
    await queryRunner.query(`
      UPDATE "users" u SET "phone" = NULL
      WHERE u."phone" IS NOT NULL AND u."id" NOT IN (
        SELECT DISTINCT ON ("phone") "id" FROM "users"
        WHERE "phone" IS NOT NULL
        ORDER BY "phone", "created_at" ASC
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "users_phone_unique_idx" ON "users" ("phone") WHERE "phone" IS NOT NULL`,
    );

    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "CHK_users_identifier_present" CHECK ("email" IS NOT NULL OR "phone" IS NOT NULL)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "CHK_users_identifier_present"`,
    );
    await queryRunner.query(`DROP INDEX "public"."users_phone_unique_idx"`);
    await queryRunner.query(`DROP INDEX "public"."users_email_unique_idx"`);
    // Rows with NULL email fail this NOT NULL restore — expected/safe on rollback.
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email")`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "staff_role"`);
    await queryRunner.query(
      `ALTER TABLE "users" DROP CONSTRAINT "FK_users_owner_id"`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "owner_id"`);
    await queryRunner.query(`DROP TYPE "public"."users_staff_role_enum"`);
    // Postgres can't drop a single enum value — recreate users_role_enum without it.
    // Rows still set to 'staff' will fail this cast, which is the expected/safe
    // behavior for a destructive rollback (same pattern as
    // AddPausedStatusToRecurringSchedules1787920000000).
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE text`,
    );
    await queryRunner.query(`DROP TYPE "public"."users_role_enum"`);
    await queryRunner.query(
      `CREATE TYPE "public"."users_role_enum" AS ENUM('customer', 'owner', 'admin')`,
    );
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "role" TYPE "public"."users_role_enum" USING "role"::"public"."users_role_enum"`,
    );
  }
}
