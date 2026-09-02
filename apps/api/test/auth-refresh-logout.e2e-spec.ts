import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';

describe('POST /auth/refresh and /auth/logout (e2e)', () => {
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

  async function registerVerifyAndLogin(email: string, password: string) {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, fullName: 'Test User' });
    const call = mockMailService.sendVerificationEmail.mock.calls.find(
      ([to]) => to === email,
    );
    await request(app.getHttpServer())
      .get('/auth/verify-email')
      .query({ token: call![1] });
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: email, password });
    return loginResponse.body as { accessToken: string; refreshToken: string };
  }

  it('issues a new token pair and revokes the old refresh token', async () => {
    const { refreshToken } = await registerVerifyAndLogin(
      'refresh-me@test.com',
      'password123',
    );

    const response = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(201);

    expect(typeof response.body.accessToken).toBe('string');
    expect(typeof response.body.refreshToken).toBe('string');
    expect(response.body.refreshToken).not.toBe(refreshToken);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('rejects an unknown refresh token with 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'not-a-real-token' })
      .expect(401);
  });

  it('logout revokes the refresh token so it can no longer be used', async () => {
    const { refreshToken } = await registerVerifyAndLogin(
      'logout-me@test.com',
      'password123',
    );

    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });
});
