import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';

describe('Change password (e2e)', () => {
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
      .send({ email, password, fullName: 'Change PW User' });
    const call = mockMailService.sendVerificationEmail.mock.calls.find(([to]) => to === email);
    await request(app.getHttpServer()).get('/auth/verify-email').query({ token: call![1] });
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: email, password });
    return {
      accessToken: loginResponse.body.accessToken as string,
      refreshToken: loginResponse.body.refreshToken as string,
    };
  }

  it('changes the password and revokes existing refresh tokens', async () => {
    const { accessToken, refreshToken } = await registerVerifyAndLogin(
      'changepw@test.com',
      'oldpassword1',
    );

    await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'oldpassword1', newPassword: 'newpassword1' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: 'changepw@test.com', password: 'oldpassword1' })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: 'changepw@test.com', password: 'newpassword1' })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('rejects with 400 when currentPassword is wrong', async () => {
    const { accessToken } = await registerVerifyAndLogin('changepw2@test.com', 'oldpassword1');

    await request(app.getHttpServer())
      .post('/auth/change-password')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'not-the-right-password', newPassword: 'newpassword1' })
      .expect(400);
  });

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/change-password')
      .send({ currentPassword: 'x', newPassword: 'newpassword1' })
      .expect(401);
  });
});
