import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';

describe('POST /auth/login (e2e)', () => {
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

  async function registerAndVerifyCustomer(email: string, password: string) {
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

  it('logs in an active customer and returns access + refresh tokens', async () => {
    await registerAndVerifyCustomer('login-me@test.com', 'password123');

    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'login-me@test.com', password: 'password123' })
      .expect(201);

    expect(typeof response.body.accessToken).toBe('string');
    expect(typeof response.body.refreshToken).toBe('string');
  });

  it('rejects a wrong password with 401', async () => {
    await registerAndVerifyCustomer('wrong-pass@test.com', 'password123');

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'wrong-pass@test.com', password: 'nope-nope-nope' })
      .expect(401);
  });

  it('rejects an unknown email with 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'nobody@test.com', password: 'password123' })
      .expect(401);
  });

  it('rejects an unverified customer with 403', async () => {
    await request(app.getHttpServer()).post('/auth/register').send({
      email: 'unverified@test.com',
      password: 'password123',
      fullName: 'A',
    });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'unverified@test.com', password: 'password123' })
      .expect(403);
  });

  it('rejects an owner pending admin approval with 403', async () => {
    await request(app.getHttpServer()).post('/auth/register/owner').send({
      email: 'pending-owner@test.com',
      password: 'password123',
      fullName: 'Owner',
    });
    const call = mockMailService.sendVerificationEmail.mock.calls.find(
      ([to]) => to === 'pending-owner@test.com',
    );
    await request(app.getHttpServer())
      .get('/auth/verify-email')
      .query({ token: call![1] });

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'pending-owner@test.com', password: 'password123' })
      .expect(403);
  });
});
