import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';

describe('Password reset (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await clearDatabase(app);
    mockMailService.sendVerificationEmail.mockClear();
    mockMailService.sendPasswordResetEmail.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerAndVerify(email: string, password: string) {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, fullName: 'Test User' });
    const call = mockMailService.sendVerificationEmail.mock.calls.find(
      ([to]) => to === email,
    );
    await request(app.getHttpServer())
      .get('/auth/verify-email')
      .query({ token: call![1] });
  }

  it('resets the password and revokes existing refresh tokens', async () => {
    await registerAndVerify('reset-me@test.com', 'oldpassword1');
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: 'reset-me@test.com', password: 'oldpassword1' });
    const oldRefreshToken = loginResponse.body.refreshToken as string;

    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'reset-me@test.com' })
      .expect(200);
    const [, rawToken] = mockMailService.sendPasswordResetEmail.mock.calls[0];

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: rawToken, newPassword: 'newpassword1' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: 'reset-me@test.com', password: 'oldpassword1' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: 'reset-me@test.com', password: 'newpassword1' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: oldRefreshToken })
      .expect(401);
  });

  it('returns 200 even for an unknown email (no enumeration)', async () => {
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'nobody@test.com' })
      .expect(200);

    expect(mockMailService.sendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('rejects an invalid reset token with 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: 'not-a-real-token', newPassword: 'newpassword1' })
      .expect(400);
  });

  it('rejects reusing an already-used reset token with 400', async () => {
    await registerAndVerify('reuse-token@test.com', 'oldpassword1');
    await request(app.getHttpServer())
      .post('/auth/forgot-password')
      .send({ email: 'reuse-token@test.com' });
    const [, rawToken] = mockMailService.sendPasswordResetEmail.mock.calls[0];

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: rawToken, newPassword: 'newpassword1' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/reset-password')
      .send({ token: rawToken, newPassword: 'anotherpassword' })
      .expect(400);
  });
});
