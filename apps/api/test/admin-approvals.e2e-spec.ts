import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';

describe('Admin approvals - merged queue (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
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

  async function createOwner(
    email: string,
    status: UserStatus,
  ): Promise<string> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const repo = dataSource.getRepository(User);
    const owner = await repo.save(
      repo.create({
        email,
        passwordHash,
        fullName: `Owner ${email}`,
        role: UserRole.OWNER,
        status,
        emailVerified: true,
      }),
    );
    return owner.id;
  }

  async function createVenue(
    ownerId: string,
    name: string,
    status: VenueStatus,
  ): Promise<string> {
    const repo = dataSource.getRepository(Venue);
    const venue = await repo.save(
      repo.create({
        ownerId,
        name,
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        status,
      }),
    );
    return venue.id;
  }

  it('merges pending owners and venues, showing owner status on venue rows', async () => {
    const activeOwnerId = await createOwner(
      'active-owner@test.com',
      UserStatus.ACTIVE,
    );
    await createVenue(
      activeOwnerId,
      'Venue Of Active Owner',
      VenueStatus.PENDING_APPROVAL,
    );
    await createOwner('pending-owner@test.com', UserStatus.PENDING_APPROVAL);
    const adminToken = await createAdminAndLogin();

    const response = await request(app.getHttpServer())
      .get('/admin/approvals')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toHaveLength(2);
    const venueRow = response.body.find((row: { type: string }) => row.type === 'venue');
    const ownerRow = response.body.find((row: { type: string }) => row.type === 'owner');
    expect(venueRow).toMatchObject({
      name: 'Venue Of Active Owner',
      owner: { status: 'active' },
    });
    expect(ownerRow).toMatchObject({ email: 'pending-owner@test.com' });
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
      .get('/admin/approvals')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(403);
  });

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer()).get('/admin/approvals').expect(401);
  });
});
