import { MigrationInterface, QueryRunner } from 'typeorm';

export class RelaxBookingsCustomerXorForGuestContact1788000000000
  implements MigrationInterface
{
  name = 'RelaxBookingsCustomerXorForGuestContact1788000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "CHK_bookings_customer_xor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "CHK_bookings_customer_xor" CHECK (
        NOT ("customer_id" IS NOT NULL AND "customer_contact_id" IS NOT NULL)
        AND ("customer_id" IS NOT NULL OR "customer_contact_id" IS NOT NULL OR "contact_name" IS NOT NULL)
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "CHK_bookings_customer_xor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "CHK_bookings_customer_xor" CHECK (("customer_id" IS NOT NULL) <> ("customer_contact_id" IS NOT NULL))`,
    );
  }
}
