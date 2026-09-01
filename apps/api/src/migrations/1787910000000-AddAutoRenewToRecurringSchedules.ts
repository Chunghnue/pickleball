import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAutoRenewToRecurringSchedules1787910000000
  implements MigrationInterface
{
  name = 'AddAutoRenewToRecurringSchedules1787910000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recurring_schedules" ADD "auto_renew" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "recurring_schedules" DROP COLUMN "auto_renew"`,
    );
  }
}
