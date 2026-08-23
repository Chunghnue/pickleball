import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';

describe('GET /auth/verify-email (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await clearDatabase(app);
    mockMailService.sendVerificationEmail.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('activates a customer account with a valid token', async () => {
    await request(app.getHttpServer()).post('/auth/register').send({
      email: 'verify-me@test.com',
      password: 'password123',
      fullName: 'A',
    });
    const [, rawToken] = mockMailService.sendVerificationEmail.mock.calls[0];

    const response = await request(app.getHttpServer())
      .get('/auth/verify-email')
      .query({ token: rawToken })
      .expect(200);

    expect(response.body).toEqual({ status: 'active' });
  });

  it('rejects an invalid token with 400', async () => {
    await request(app.getHttpServer())
      .get('/auth/verify-email')
      .query({ token: 'not-a-real-token' })
      .expect(400);
  });

  it('rejects an expired token with 400', async () => {
    await request(app.getHttpServer()).post('/auth/register').send({
      email: 'expired@test.com',
      password: 'password123',
      fullName: 'B',
    });
    const dataSource = app.get(DataSource);
    await dataSource.query(
      "UPDATE email_verification_tokens SET expires_at = NOW() - INTERVAL '1 hour'",
    );
    const [, rawToken] = mockMailService.sendVerificationEmail.mock.calls[0];

    await request(app.getHttpServer())
      .get('/auth/verify-email')
      .query({ token: rawToken })
      .expect(400);
  });
});
