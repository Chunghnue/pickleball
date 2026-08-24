import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateBookings1787580899019 implements MigrationInterface {
    name = 'CreateBookings1787580899019'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "booking_slots" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "booking_id" character varying NOT NULL, "court_id" character varying NOT NULL, "date" date NOT NULL, "slot_start" TIME NOT NULL, CONSTRAINT "PK_9596369395c8747c94a5606c4de" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_28f69b3b25408c57ebf699ee74" ON "booking_slots"  ("court_id", "date", "slot_start") `);
        await queryRunner.query(`CREATE TYPE "public"."bookings_status_enum" AS ENUM('confirmed', 'cancelled', 'completed')`);
        await queryRunner.query(`CREATE TABLE "bookings" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "court_id" character varying NOT NULL, "customer_id" character varying NOT NULL, "date" date NOT NULL, "start_time" TIME NOT NULL, "end_time" TIME NOT NULL, "total_price" numeric(10,2) NOT NULL, "status" "public"."bookings_status_enum" NOT NULL DEFAULT 'confirmed', "cancelled_at" TIMESTAMP, "cancelled_by" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_bee6805982cc1e248e94ce94957" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "bookings"`);
        await queryRunner.query(`DROP TYPE "public"."bookings_status_enum"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_28f69b3b25408c57ebf699ee74"`);
        await queryRunner.query(`DROP TABLE "booking_slots"`);
    }

}
