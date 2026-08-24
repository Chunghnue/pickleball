import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateVenuesAndCourts1787555356557 implements MigrationInterface {
    name = 'CreateVenuesAndCourts1787555356557'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "courts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "venue_id" character varying NOT NULL, "name" character varying NOT NULL, "price_per_hour" numeric(10,2) NOT NULL, "open_time" TIME NOT NULL, "close_time" TIME NOT NULL, "slot_duration_minutes" integer NOT NULL, "is_active" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_948a5d356c3083f3237ecbf9897" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TABLE "venue_images" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "venue_id" character varying NOT NULL, "url" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_3cdef3bcc3a9d5c7a1a47dede36" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE TYPE "public"."venues_status_enum" AS ENUM('pending_approval', 'active', 'rejected')`);
        await queryRunner.query(`CREATE TABLE "venues" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_id" character varying NOT NULL, "name" character varying NOT NULL, "address" character varying NOT NULL, "city" character varying NOT NULL, "description" character varying, "status" "public"."venues_status_enum" NOT NULL DEFAULT 'pending_approval', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_cb0f885278d12384eb7a81818be" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "venues"`);
        await queryRunner.query(`DROP TYPE "public"."venues_status_enum"`);
        await queryRunner.query(`DROP TABLE "venue_images"`);
        await queryRunner.query(`DROP TABLE "courts"`);
    }

}
