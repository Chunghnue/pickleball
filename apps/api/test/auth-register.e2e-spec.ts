import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';

describe('POST /auth/register (e2e)', () => {
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

  it('registers a new customer and sends a verification email', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: 'customer@test.com',
        password: 'password123',
        fullName: 'Nguyen Van A',
      })
      .expect(201);

    expect(response.body).toMatchObject({ email: 'customer@test.com' });
    expect(response.body.id).toBeDefined();
    expect(mockMailService.sendVerificationEmail).toHaveBeenCalledWith(
      'customer@test.com',
      expect.any(String),
    );
  });

  it('rejects duplicate email with 409', async () => {
    await request(app.getHttpServer()).post('/auth/register').send({
      email: 'dup@test.com',
      password: 'password123',
      fullName: 'A',
    });

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'dup@test.com', password: 'password123', fullName: 'B' })
      .expect(409);
  });

  it('rejects an invalid payload with 400', async () => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: 'not-an-email', password: '123', fullName: '' })
      .expect(400);
  });
});
