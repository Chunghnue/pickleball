import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRecurringSchedulesToBookings1787880000000
  implements MigrationInterface
{
  name = 'AddRecurringSchedulesToBookings1787880000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."recurring_schedules_status_enum" AS ENUM('active', 'cancelled')`,
    );
    await queryRunner.query(
      `CREATE TABLE "recurring_schedules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "court_id" character varying NOT NULL, "customer_id" character varying, "customer_contact_id" character varying, "day_of_week" integer NOT NULL, "start_time" TIME NOT NULL, "end_time" TIME NOT NULL, "price_per_session" numeric(10,2) NOT NULL, "discount_percent" numeric(5,2), "valid_from" date NOT NULL, "valid_to" date NOT NULL, "note" character varying, "status" "public"."recurring_schedules_status_enum" NOT NULL DEFAULT 'active', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_recurring_schedules_id" PRIMARY KEY ("id"), CONSTRAINT "CHK_recurring_schedules_customer_xor" CHECK (("customer_id" IS NOT NULL) <> ("customer_contact_id" IS NOT NULL)))`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "recurring_schedule_id" uuid`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_recurring_schedule_id" FOREIGN KEY ("recurring_schedule_id") REFERENCES "recurring_schedules"("id") ON DELETE SET NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_bookings_recurring_schedule_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN "recurring_schedule_id"`,
    );
    await queryRunner.query(`DROP TABLE "recurring_schedules"`);
    await queryRunner.query(
      `DROP TYPE "public"."recurring_schedules_status_enum"`,
    );
  }
}
