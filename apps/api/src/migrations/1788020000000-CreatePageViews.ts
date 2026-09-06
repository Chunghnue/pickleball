import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreatePageViews1788020000000 implements MigrationInterface {
  name = 'CreatePageViews1788020000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "page_views" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "venue_id" character varying NOT NULL, "visitor_id" character varying NOT NULL, "user_id" character varying, "path" character varying NOT NULL, "referrer" character varying, "source" character varying, "is_mobile" boolean NOT NULL DEFAULT false, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_page_views_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_page_views_venue_id_created_at" ON "page_views" ("venue_id", "created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_page_views_created_at" ON "page_views" ("created_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_page_views_created_at"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_page_views_venue_id_created_at"`);
    await queryRunner.query(`DROP TABLE "page_views"`);
  }
}
