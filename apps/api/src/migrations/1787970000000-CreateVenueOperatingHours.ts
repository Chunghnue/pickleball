import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateVenueOperatingHours1787970000000 implements MigrationInterface {
  name = 'CreateVenueOperatingHours1787970000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "venue_operating_hours" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "venue_id" character varying NOT NULL, "day_of_week" integer NOT NULL, "is_open" boolean NOT NULL DEFAULT true, "open_time" TIME, "close_time" TIME, CONSTRAINT "PK_venue_operating_hours_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "venue_operating_hours_venue_day_unique_idx" ON "venue_operating_hours" ("venue_id", "day_of_week")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."venue_operating_hours_venue_day_unique_idx"`);
    await queryRunner.query(`DROP TABLE "venue_operating_hours"`);
  }
}
