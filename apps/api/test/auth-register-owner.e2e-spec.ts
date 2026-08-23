import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';

describe('POST /auth/register/owner (e2e)', () => {
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

  it('registers an owner who stays pending_approval after email verification', async () => {
    await request(app.getHttpServer())
      .post('/auth/register/owner')
      .send({
        email: 'owner@test.com',
        password: 'password123',
        fullName: 'Chu San',
      })
      .expect(201);

    const [, rawToken] = mockMailService.sendVerificationEmail.mock.calls[0];

    const response = await request(app.getHttpServer())
      .get('/auth/verify-email')
      .query({ token: rawToken })
      .expect(200);

    expect(response.body).toEqual({ status: 'pending_approval' });
  });
});
