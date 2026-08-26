import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateDisputes1787760000000 implements MigrationInterface {
    name = 'CreateDisputes1787760000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."disputes_status_enum" AS ENUM('pending', 'resolved_refund', 'rejected')`);
        await queryRunner.query(`CREATE TABLE "disputes" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "booking_id" character varying NOT NULL, "customer_id" character varying NOT NULL, "reason" text NOT NULL, "status" "public"."disputes_status_enum" NOT NULL DEFAULT 'pending', "admin_note" text, "resolved_by" character varying, "resolved_at" TIMESTAMP, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_disputes_booking_id" UNIQUE ("booking_id"), CONSTRAINT "PK_disputes_id" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "disputes"`);
        await queryRunner.query(`DROP TYPE "public"."disputes_status_enum"`);
    }

}
