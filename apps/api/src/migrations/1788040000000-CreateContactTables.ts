import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateContactTables1788040000000 implements MigrationInterface {
  name = 'CreateContactTables1788040000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "support_messages" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "full_name" character varying NOT NULL, "phone" character varying NOT NULL, "email" character varying, "message" text NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_support_messages_id" PRIMARY KEY ("id"))`,
    );

    await queryRunner.query(
      `CREATE TYPE "public"."partner_applications_sport_types_enum" AS ENUM('bong-da', 'tennis', 'cau-long', 'pickleball', 'bong-ban', 'bong-ro', 'khac')`,
    );
    await queryRunner.query(
      `CREATE TABLE "partner_applications" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_full_name" character varying NOT NULL, "owner_phone" character varying NOT NULL, "owner_email" character varying NOT NULL, "venue_name" character varying NOT NULL, "address" character varying NOT NULL, "province" character varying NOT NULL, "ward" character varying, "sport_types" "public"."partner_applications_sport_types_enum"[] NOT NULL, "court_count" integer NOT NULL, "website" character varying, "note" text, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_partner_applications_id" PRIMARY KEY ("id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "partner_applications"`);
    await queryRunner.query(
      `DROP TYPE "public"."partner_applications_sport_types_enum"`,
    );
    await queryRunner.query(`DROP TABLE "support_messages"`);
  }
}
