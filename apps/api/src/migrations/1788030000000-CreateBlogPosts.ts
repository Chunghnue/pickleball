import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateBlogPosts1788030000000 implements MigrationInterface {
  name = 'CreateBlogPosts1788030000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TYPE "public"."blog_posts_category_enum" AS ENUM('phan-mem', 'kinh-doanh', 'xu-huong', 'huong-dan')`,
    );
    await queryRunner.query(
      `CREATE TABLE "blog_posts" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "slug" character varying NOT NULL, "title" character varying NOT NULL, "excerpt" character varying NOT NULL, "content" text NOT NULL, "category" "public"."blog_posts_category_enum" NOT NULL, "cover_image_url" character varying, "reading_minutes" integer NOT NULL, "published_at" TIMESTAMP NOT NULL, "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_blog_posts_id" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_blog_posts_slug" ON "blog_posts" ("slug")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_blog_posts_category_published_at" ON "blog_posts" ("category", "published_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX "public"."IDX_blog_posts_category_published_at"`,
    );
    await queryRunner.query(`DROP INDEX "public"."IDX_blog_posts_slug"`);
    await queryRunner.query(`DROP TABLE "blog_posts"`);
    await queryRunner.query(`DROP TYPE "public"."blog_posts_category_enum"`);
  }
}
