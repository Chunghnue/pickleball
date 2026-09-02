import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';

describe('GET/PATCH /users/me (e2e)', () => {
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

  async function registerVerifyAndLogin(
    email: string,
    password: string,
  ): Promise<string> {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, fullName: 'Original Name' });
    const call = mockMailService.sendVerificationEmail.mock.calls.find(
      ([to]) => to === email,
    );
    await request(app.getHttpServer())
      .get('/auth/verify-email')
      .query({ token: call![1] });
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: email, password });
    return loginResponse.body.accessToken as string;
  }

  it('returns the current user profile without passwordHash', async () => {
    const token = await registerVerifyAndLogin(
      'profile-me@test.com',
      'password123',
    );

    const response = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toMatchObject({
      email: 'profile-me@test.com',
      fullName: 'Original Name',
    });
    expect(response.body.passwordHash).toBeUndefined();
  });

  it('updates full name, phone, and avatar', async () => {
    const token = await registerVerifyAndLogin(
      'update-me@test.com',
      'password123',
    );

    const response = await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .send({
        fullName: 'Updated Name',
        phone: '0900000000',
        avatarUrl: 'https://example.com/avatar.png',
      })
      .expect(200);

    expect(response.body).toMatchObject({
      fullName: 'Updated Name',
      phone: '0900000000',
      avatarUrl: 'https://example.com/avatar.png',
    });
  });

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer()).get('/users/me').expect(401);
  });
});
