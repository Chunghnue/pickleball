import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';

describe('Admin venue approval (e2e)', () => {
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

  async function createOwnerWithPendingVenue(
    ownerEmail: string,
    venueName: string,
  ): Promise<{ ownerId: string; venueId: string }> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const usersRepo = dataSource.getRepository(User);
    const owner = await usersRepo.save(
      usersRepo.create({
        email: ownerEmail,
        passwordHash,
        fullName: `Owner ${ownerEmail}`,
        role: UserRole.OWNER,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const venuesRepo = dataSource.getRepository(Venue);
    const venue = await venuesRepo.save(
      venuesRepo.create({
        ownerId: owner.id,
        name: venueName,
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.PENDING_APPROVAL,
      }),
    );
    return { ownerId: owner.id, venueId: venue.id };
  }

  it('lists pending venues for an admin', async () => {
    await createOwnerWithPendingVenue('owner1@test.com', 'Sân ABC');
    const adminToken = await createAdminAndLogin();

    const response = await request(app.getHttpServer())
      .get('/admin/venues/pending')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ name: 'Sân ABC' });
  });

  it('approves a venue, sends an approval email, and makes it publicly visible', async () => {
    const { venueId } = await createOwnerWithPendingVenue(
      'owner2@test.com',
      'Sân XYZ',
    );
    const adminToken = await createAdminAndLogin();

    await request(app.getHttpServer())
      .post(`/admin/venues/${venueId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);

    const call = mockMailService.send.mock.calls.find(
      ([to]) => to === 'owner2@test.com',
    );
    expect(call).toBeDefined();

    await request(app.getHttpServer())
      .get(`/venues/${venueId}`)
      .expect(200);
  });

  it('rejects a venue with a reason and sends a rejection email containing it', async () => {
    const { venueId } = await createOwnerWithPendingVenue(
      'owner3@test.com',
      'Sân DEF',
    );
    const adminToken = await createAdminAndLogin();

    await request(app.getHttpServer())
      .post(`/admin/venues/${venueId}/reject`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Thiếu giấy phép kinh doanh' })
      .expect(201);

    const call = mockMailService.send.mock.calls.find(
      ([to]) => to === 'owner3@test.com',
    );
    expect(call).toBeDefined();
    expect(call![2]).toContain('Thiếu giấy phép kinh doanh');
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
      .get('/admin/venues/pending')
      .set('Authorization', `Bearer ${loginResponse.body.accessToken}`)
      .expect(403);
  });

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer())
      .get('/admin/venues/pending')
      .expect(401);
  });
});
