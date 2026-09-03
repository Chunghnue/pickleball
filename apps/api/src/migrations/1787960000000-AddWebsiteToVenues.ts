import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWebsiteToVenues1787960000000 implements MigrationInterface {
  name = 'AddWebsiteToVenues1787960000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "venues" ADD "website" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "venues" DROP COLUMN "website"`);
  }
}
