import { MigrationInterface, QueryRunner } from "typeorm";

export class AddCancellationCutoffToVenues1787580792491 implements MigrationInterface {
    name = 'AddCancellationCutoffToVenues1787580792491'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venues" ADD "cancellation_cutoff_hours" integer NOT NULL DEFAULT '2'`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "cancellation_cutoff_hours"`);
    }

}
