import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationSettings1787980000000 implements MigrationInterface {
  name = 'CreateNotificationSettings1787980000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "notification_settings" ("owner_id" uuid NOT NULL, "new_booking" boolean NOT NULL DEFAULT true, "cancellation" boolean NOT NULL DEFAULT true, "payment" boolean NOT NULL DEFAULT true, "daily_report" boolean NOT NULL DEFAULT true, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_notification_settings_owner_id" PRIMARY KEY ("owner_id"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "notification_settings"`);
  }
}
