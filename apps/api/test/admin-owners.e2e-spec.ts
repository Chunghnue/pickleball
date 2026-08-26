import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';

describe('Admin owner approval (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await clearDatabase(app);
    mockMailService.sendVerificationEmail.mockClear();
    mockMailService.send.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createAdminAndLogin(): Promise<string> {
    const dataSource = app.get(DataSource);
    const passwordHash = await bcrypt.hash('adminpass123', 10);
    const repo = dataSource.getRepository(User);
    await repo.save(
      repo.create({
        email: 'admin@test.com',
        passwordHash,
        fullName: 'Admin',
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@test.com', password: 'adminpass123' });
    return loginResponse.body.accessToken as string;
  }

  async function registerVerifiedOwner(email: string): Promise<void> {
    await request(app.getHttpServer()).post('/auth/register/owner').send({
      email,
      password: 'password123',
      fullName: 'Owner',
    });
    const call = mockMailService.sendVerificationEmail.mock.calls.find(
      ([to]) => to === email,
    );
    await request(app.getHttpServer())
      .get('/auth/verify-email')
      .query({ token: call![1] });
  }

  it('lists pending owners for an admin, without leaking passwordHash', async () => {
    await registerVerifiedOwner('pending1@test.com');
    const adminToken = await createAdminAndLogin();

    const response = await request(app.getHttpServer())
      .get('/admin/owners/pending')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ email: 'pending1@test.com' });
    expect(response.body[0].passwordHash).toBeUndefined();
  });

  it('approves an owner, allowing them to log in afterwards', async () => {
    await registerVerifiedOwner('approve-me@test.com');
    const adminToken = await createAdminAndLogin();
    const dataSource = app.get(DataSource);
    const owner = await dataSource
      .getRepository(User)
      .findOneOrFail({ where: { email: 'approve-me@test.com' } });

    await request(app.getHttpServer())
      .post(`/admin/owners/${owner.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'approve-me@test.com', password: 'password123' })
      .expect(201);
  });

  it('rejects an owner, keeping them unable to log in', async () => {
    await registerVerifiedOwner('reject-me@test.com');
    const adminToken = await createAdminAndLogin();
    const dataSource = app.get(DataSource);
    const owner = await dataSource
      .getRepository(User)
      .findOneOrFail({ where: { email: 'reject-me@test.com' } });

    await request(app.getHttpServer())
      .post(`/admin/owners/${owner.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'reject-me@test.com', password: 'password123' })
      .expect(403);
  });

  it('rejects a non-admin active user with 403', async () => {
    await request(app.getHttpServer()).post('/auth/register').send({
      email: 'customer@test.com',
      password: 'password123',
      fullName: 'Customer',
    });
    const call = mockMailService.sendVerificationEmail.mock.calls.find(
      ([to]) => to === 'customer@test.com',
    );
    await request(app.getHttpServer())
      .get('/auth/verify-email')
      .query({ token: call![1] });
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'customer@test.com', password: 'password123' });

    await request(app.getHttpServer())
      .get('/admin/owners/pending')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(403);
  });

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer())
      .get('/admin/owners/pending')
      .expect(401);
  });

  it('sends an approval email when approving an owner', async () => {
    await registerVerifiedOwner('approve-email@test.com');
    const adminToken = await createAdminAndLogin();
    const dataSource = app.get(DataSource);
    const owner = await dataSource
      .getRepository(User)
      .findOneOrFail({ where: { email: 'approve-email@test.com' } });

    await request(app.getHttpServer())
      .post(`/admin/owners/${owner.id}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const call = mockMailService.send.mock.calls.find(
      ([to]) => to === 'approve-email@test.com',
    );
    expect(call).toBeDefined();
  });

  it('sends a rejection email containing the reason when rejecting an owner', async () => {
    await registerVerifiedOwner('reject-with-reason@test.com');
    const adminToken = await createAdminAndLogin();
    const dataSource = app.get(DataSource);
    const owner = await dataSource
      .getRepository(User)
      .findOneOrFail({ where: { email: 'reject-with-reason@test.com' } });

    await request(app.getHttpServer())
      .post(`/admin/owners/${owner.id}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Thiếu giấy phép kinh doanh' })
      .expect(201);

    const call = mockMailService.send.mock.calls.find(
      ([to]) => to === 'reject-with-reason@test.com',
    );
    expect(call).toBeDefined();
    expect(call![2]).toContain('Thiếu giấy phép kinh doanh');
  });
});
