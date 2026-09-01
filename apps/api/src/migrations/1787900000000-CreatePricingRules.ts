import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePricingRules1787900000000 implements MigrationInterface {
  name = 'CreatePricingRules1787900000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "pricing_rules" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "court_id" character varying NOT NULL, "name" character varying NOT NULL, "days_of_week" character varying NOT NULL, "start_time" TIME NOT NULL, "end_time" TIME NOT NULL, "price" numeric(10,2) NOT NULL, "priority" integer NOT NULL DEFAULT 0, "advance_booking_hours" integer, "advance_price" numeric(10,2), "valid_from" date, "valid_to" date, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_pricing_rules_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_pricing_rules_court_id" ON "pricing_rules" ("court_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_pricing_rules_court_id"`);
    await queryRunner.query(`DROP TABLE "pricing_rules"`);
  }
}
