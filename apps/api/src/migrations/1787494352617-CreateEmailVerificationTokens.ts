import { MigrationInterface, QueryRunner } from "typeorm";

export class CreateEmailVerificationTokens1787494352617 implements MigrationInterface {
    name = 'CreateEmailVerificationTokens1787494352617'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "email_verification_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying NOT NULL, "token_hash" character varying NOT NULL, "expires_at" TIMESTAMP NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_c20ed35f3d31d486aabcd0564da" UNIQUE ("token_hash"), CONSTRAINT "PK_417a095bbed21c2369a6a01ab9a" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "email_verification_tokens"`);
    }

}
