import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCourtDetailsAndImages1787860000000 implements MigrationInterface {
    name = 'AddCourtDetailsAndImages1787860000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TYPE "public"."courts_status_enum" AS ENUM('active', 'maintenance', 'closed')`);
        await queryRunner.query(`ALTER TABLE "courts" ADD "status" "public"."courts_status_enum" NOT NULL DEFAULT 'active'`);
        await queryRunner.query(`UPDATE "courts" SET "status" = 'closed' WHERE "is_active" = false`);
        await queryRunner.query(`ALTER TABLE "courts" DROP COLUMN "is_active"`);
        await queryRunner.query(`ALTER TABLE "courts" ADD "description" character varying`);
        await queryRunner.query(`ALTER TABLE "courts" ADD "capacity" integer`);
        await queryRunner.query(`ALTER TABLE "courts" ADD "display_order" integer NOT NULL DEFAULT 0`);
        await queryRunner.query(`CREATE TABLE "court_images" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "court_id" character varying NOT NULL, "url" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_court_images_id" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "court_images"`);
        await queryRunner.query(`ALTER TABLE "courts" DROP COLUMN "display_order"`);
        await queryRunner.query(`ALTER TABLE "courts" DROP COLUMN "capacity"`);
        await queryRunner.query(`ALTER TABLE "courts" DROP COLUMN "description"`);
        await queryRunner.query(`ALTER TABLE "courts" ADD "is_active" boolean NOT NULL DEFAULT true`);
        await queryRunner.query(`UPDATE "courts" SET "is_active" = false WHERE "status" IN ('closed', 'maintenance')`);
        await queryRunner.query(`ALTER TABLE "courts" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."courts_status_enum"`);
    }
}
