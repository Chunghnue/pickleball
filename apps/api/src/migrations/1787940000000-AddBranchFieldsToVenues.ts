import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBranchFieldsToVenues1787940000000
  implements MigrationInterface
{
  name = 'AddBranchFieldsToVenues1787940000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "venues" ADD "slug" character varying`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "venues_slug_unique_idx" ON "venues" ("slug") WHERE "slug" IS NOT NULL`,
    );
    await queryRunner.query(`ALTER TABLE "venues" ADD "district" character varying`);
    await queryRunner.query(`ALTER TABLE "venues" ADD "latitude" double precision`);
    await queryRunner.query(`ALTER TABLE "venues" ADD "longitude" double precision`);
    await queryRunner.query(`ALTER TABLE "venues" ADD "email" character varying`);
    await queryRunner.query(
      `ALTER TABLE "venues" ADD "is_hidden" boolean NOT NULL DEFAULT false`,
    );

    await queryRunner.query(
      `CREATE TABLE "venue_slug_history" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "venue_id" character varying NOT NULL, "old_slug" character varying, "changed_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_venue_slug_history_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_venue_slug_history_venue_id" ON "venue_slug_history" ("venue_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_venue_slug_history_venue_id"`);
    await queryRunner.query(`DROP TABLE "venue_slug_history"`);
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "is_hidden"`);
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "email"`);
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "longitude"`);
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "latitude"`);
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "district"`);
    await queryRunner.query(`DROP INDEX "public"."venues_slug_unique_idx"`);
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "slug"`);
  }
}
