import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { BlogPost, BlogCategory } from '../src/blog/entities/blog-post.entity';

describe('Blog e2e', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await clearDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createPost(overrides: Partial<BlogPost> = {}) {
    const repo = dataSource.getRepository(BlogPost);
    return repo.save(
      repo.create({
        slug: overrides.slug ?? `bai-viet-${Math.random().toString(36).slice(2)}`,
        title: overrides.title ?? 'Bài viết mẫu',
        excerpt: overrides.excerpt ?? 'Mô tả ngắn',
        content: overrides.content ?? 'Nội dung bài viết',
        category: overrides.category ?? BlogCategory.HUONG_DAN,
        readingMinutes: overrides.readingMinutes ?? 3,
        publishedAt: overrides.publishedAt ?? new Date(),
        coverImageUrl: overrides.coverImageUrl ?? null,
      }),
    );
  }

  it('GET /blog returns posts ordered by publishedAt desc', async () => {
    const older = await createPost({ title: 'Cũ', publishedAt: new Date('2026-01-01') });
    const newer = await createPost({ title: 'Mới', publishedAt: new Date('2026-06-01') });

    const response = await request(app.getHttpServer()).get('/blog').expect(200);

    expect(response.body.total).toBe(2);
    expect(response.body.items[0].id).toBe(newer.id);
    expect(response.body.items[1].id).toBe(older.id);
  });

  it('GET /blog?category=xu-huong filters by category', async () => {
    await createPost({ category: BlogCategory.HUONG_DAN });
    const trend = await createPost({ category: BlogCategory.XU_HUONG });

    const response = await request(app.getHttpServer())
      .get('/blog?category=xu-huong')
      .expect(200);

    expect(response.body.items.map((i: { id: string }) => i.id)).toEqual([trend.id]);
  });

  it('GET /blog?query= searches title and excerpt', async () => {
    const match = await createPost({ title: 'Hướng dẫn mở sân pickleball' });
    await createPost({ title: 'Không liên quan', excerpt: 'khác' });

    const response = await request(app.getHttpServer())
      .get('/blog?query=pickleball')
      .expect(200);

    expect(response.body.items.map((i: { id: string }) => i.id)).toEqual([match.id]);
  });

  it('GET /blog paginates with page and pageSize', async () => {
    for (let i = 0; i < 3; i++) {
      await createPost({ title: `Bài ${i}`, publishedAt: new Date(2026, 0, i + 1) });
    }

    const response = await request(app.getHttpServer())
      .get('/blog?page=1&pageSize=2')
      .expect(200);

    expect(response.body.items).toHaveLength(2);
    expect(response.body.total).toBe(3);
  });

  it('GET /blog/:slug returns the matching post', async () => {
    const post = await createPost({ slug: 'huong-dan-mo-san-pickleball-tu-a-den-z' });

    const response = await request(app.getHttpServer())
      .get('/blog/huong-dan-mo-san-pickleball-tu-a-den-z')
      .expect(200);

    expect(response.body.id).toBe(post.id);
  });

  it('GET /blog/:slug 404s for an unknown slug', async () => {
    await request(app.getHttpServer()).get('/blog/khong-ton-tai').expect(404);
  });

  it('GET /blog?category=invalid rejects with 400', async () => {
    await request(app.getHttpServer()).get('/blog?category=invalid').expect(400);
  });
});
