import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddLogoUrlToVenues1787950000000 implements MigrationInterface {
  name = 'AddLogoUrlToVenues1787950000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "venues" ADD "logo_url" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "logo_url"`);
  }
}
