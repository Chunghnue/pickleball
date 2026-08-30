import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court, CourtStatus } from '../src/courts/entities/court.entity';

describe('GET /venues/mine/courts (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await clearDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  async function createOwnerAndLogin(): Promise<{ ownerId: string; token: string }> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const usersRepo = dataSource.getRepository(User);
    const owner = await usersRepo.save(
      usersRepo.create({
        email: 'owner@test.com',
        passwordHash,
        fullName: 'Owner',
        role: UserRole.OWNER,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'owner@test.com', password: 'password123' });
    return { ownerId: owner.id, token: loginResponse.body.accessToken as string };
  }

  it('returns courts across every venue instead of matching GET /venues/mine/:id', async () => {
    const { ownerId, token } = await createOwnerAndLogin();

    const venuesRepo = dataSource.getRepository(Venue);
    const venue = await venuesRepo.save(
      venuesRepo.create({
        ownerId,
        name: 'Sân ABC',
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.ACTIVE,
      }),
    );
    const courtsRepo = dataSource.getRepository(Court);
    await courtsRepo.save(
      courtsRepo.create({
        venueId: venue.id,
        name: 'Sân 1',
        pricePerHour: 100000,
        openTime: '08:00',
        closeTime: '20:00',
        slotDurationMinutes: 60,
        status: CourtStatus.ACTIVE,
      }),
    );

    const response = await request(app.getHttpServer())
      .get('/venues/mine/courts')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    // If Express matched `mine/:id` first, this would 404 with
    // "Venue courts không tồn tại" instead of returning the court list.
    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({
      name: 'Sân 1',
      venueName: 'Sân ABC',
    });
  });
});
