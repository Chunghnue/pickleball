import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';

describe('Auth rate limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await clearDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns 429 after exceeding the login rate limit', async () => {
    const payload = {
      identifier: 'rate-limit@test.com',
      password: 'wrong-password',
    };

    for (let i = 0; i < 10; i += 1) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send(payload)
        .expect(401);
    }

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(payload)
      .expect(429);
  });
});
