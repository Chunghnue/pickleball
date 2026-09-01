import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPausedStatusToRecurringSchedules1787920000000
  implements MigrationInterface
{
  name = 'AddPausedStatusToRecurringSchedules1787920000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "public"."recurring_schedules_status_enum" ADD VALUE IF NOT EXISTS 'paused'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Postgres can't drop a single enum value directly — recreate the type
    // without it. Any row still set to 'paused' will fail this cast, which
    // is the expected/safe behavior for a destructive rollback.
    await queryRunner.query(
      `ALTER TABLE "recurring_schedules" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."recurring_schedules_status_enum" RENAME TO "recurring_schedules_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."recurring_schedules_status_enum" AS ENUM('active', 'cancelled')`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_schedules" ALTER COLUMN "status" TYPE "public"."recurring_schedules_status_enum" USING "status"::text::"public"."recurring_schedules_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "recurring_schedules" ALTER COLUMN "status" SET DEFAULT 'active'`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."recurring_schedules_status_enum_old"`,
    );
  }
}
