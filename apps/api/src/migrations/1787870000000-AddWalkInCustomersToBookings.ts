import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddWalkInCustomersToBookings1787870000000
  implements MigrationInterface
{
  name = 'AddWalkInCustomersToBookings1787870000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "customer_contacts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "owner_id" character varying NOT NULL, "full_name" character varying NOT NULL, "phone" character varying NOT NULL, "email" character varying, "address" character varying, "note" character varying, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_customer_contacts_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_customer_contacts_owner_phone" ON "customer_contacts" ("owner_id", "phone")`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ALTER COLUMN "customer_id" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD "customer_contact_id" character varying`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "FK_bookings_customer_contact_id" FOREIGN KEY ("customer_contact_id") REFERENCES "customer_contacts"("id") ON DELETE RESTRICT`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ADD CONSTRAINT "CHK_bookings_customer_xor" CHECK (("customer_id" IS NOT NULL) <> ("customer_contact_id" IS NOT NULL))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "CHK_bookings_customer_xor"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP CONSTRAINT "FK_bookings_customer_contact_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" DROP COLUMN "customer_contact_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "bookings" ALTER COLUMN "customer_id" SET NOT NULL`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."IDX_customer_contacts_owner_phone"`,
    );
    await queryRunner.query(`DROP TABLE "customer_contacts"`);
  }
}
