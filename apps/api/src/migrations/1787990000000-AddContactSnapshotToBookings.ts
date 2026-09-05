import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddContactSnapshotToBookings1787990000000
  implements MigrationInterface
{
  name = 'AddContactSnapshotToBookings1787990000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "contact_name" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "contact_phone" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "contact_email" character varying`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "contact_email"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "contact_phone"`);
    await queryRunner.query(`ALTER TABLE "bookings" DROP COLUMN "contact_name"`);
  }
}
