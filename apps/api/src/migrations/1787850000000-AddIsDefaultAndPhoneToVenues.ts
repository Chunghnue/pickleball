import { MigrationInterface, QueryRunner } from "typeorm";

export class AddIsDefaultAndPhoneToVenues1787850000000 implements MigrationInterface {
    name = 'AddIsDefaultAndPhoneToVenues1787850000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venues" ADD "is_default" boolean NOT NULL DEFAULT false`);
        await queryRunner.query(`ALTER TABLE "venues" ADD "phone" character varying`);
        await queryRunner.query(`
            UPDATE "venues" SET "is_default" = true
            WHERE "id" IN (
                SELECT DISTINCT ON ("owner_id") "id"
                FROM "venues"
                ORDER BY "owner_id", "created_at" ASC
            )
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "phone"`);
        await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "is_default"`);
    }

}
