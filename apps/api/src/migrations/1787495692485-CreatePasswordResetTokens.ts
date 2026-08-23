import { MigrationInterface, QueryRunner } from "typeorm";

export class CreatePasswordResetTokens1787495692485 implements MigrationInterface {
    name = 'CreatePasswordResetTokens1787495692485'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "password_reset_tokens" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "user_id" character varying NOT NULL, "token_hash" character varying NOT NULL, "expires_at" TIMESTAMP NOT NULL, "used_at" TIMESTAMP WITH TIME ZONE, "created_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "UQ_91185d86d5d7557b19abbb2868b" UNIQUE ("token_hash"), CONSTRAINT "PK_d16bebd73e844c48bca50ff8d3d" PRIMARY KEY ("id"))`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`DROP TABLE "password_reset_tokens"`);
    }

}
