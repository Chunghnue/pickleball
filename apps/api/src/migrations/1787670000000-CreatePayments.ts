import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePayments1787670000000 implements MigrationInterface {
    name = 'CreatePayments1787670000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."payments_status_enum" AS ENUM('unpaid', 'paid', 'refunded')`);
        await queryRunner.query(`CREATE TABLE "payments" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "booking_id" character varying NOT NULL, "status" "public"."payments_status_enum" NOT NULL DEFAULT 'unpaid', "note" text, "paid_at" TIMESTAMP, "paid_by" character varying, "refunded_at" TIMESTAMP, "refunded_by" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_payments_booking_id" UNIQUE ("booking_id"), CONSTRAINT "PK_payments_id" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "payments"`);
        await queryRunner.query(`DROP TYPE "public"."payments_status_enum"`);
    }

}
