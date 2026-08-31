import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddNoteToBookings1787890000000 implements MigrationInterface {
  name = 'AddNoteToBookings1787890000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" ADD "note" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "note"`);
  }
}
