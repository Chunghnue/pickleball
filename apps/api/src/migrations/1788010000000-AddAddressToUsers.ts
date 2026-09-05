import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAddressToUsers1788010000000 implements MigrationInterface {
  name = 'AddAddressToUsers1788010000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN "address" varchar`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN "address"`);
  }
}
