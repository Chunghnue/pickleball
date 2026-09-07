import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNewsletterSubscribers1788050000000
  implements MigrationInterface
{
  name = 'CreateNewsletterSubscribers1788050000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "newsletter_subscribers" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "email" character varying NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_newsletter_subscribers_id" PRIMARY KEY ("id"), CONSTRAINT "UQ_newsletter_subscribers_email" UNIQUE ("email"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "newsletter_subscribers"`);
  }
}
