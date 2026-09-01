import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court, CourtStatus } from '../src/courts/entities/court.entity';

describe('Recurring schedules list/detail (e2e)', () => {
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

  it('lists schedules with occurrence counts and returns schedule detail with occurrences', async () => {
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
    const token = loginResponse.body.accessToken as string;

    const venuesRepo = dataSource.getRepository(Venue);
    const venue = await venuesRepo.save(
      venuesRepo.create({
        ownerId: owner.id,
        name: 'Sân ABC',
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.ACTIVE,
      }),
    );
    const courtsRepo = dataSource.getRepository(Court);
    const court = await courtsRepo.save(
      courtsRepo.create({
        venueId: venue.id,
        name: 'Sân 1',
        pricePerHour: 100000,
        openTime: '08:00',
        closeTime: '23:00',
        slotDurationMinutes: 60,
        status: CourtStatus.ACTIVE,
      }),
    );

    const createResponse = await request(app.getHttpServer())
      .post(`/venues/mine/${venue.id}/recurring-schedules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        courtId: court.id,
        dayOfWeek: 0,
        startTime: '18:00',
        endTime: '19:00',
        pricePerSession: 100000,
        validFrom: '2099-01-05', // a Monday
        validTo: '2099-01-19',
        newCustomer: { fullName: 'Khách quen', phone: '0933333333' },
      })
      .expect(201);
    const scheduleId = createResponse.body.schedule.id as string;
    expect(createResponse.body.generatedCount).toBe(3);

    const listResponse = await request(app.getHttpServer())
      .get(`/venues/mine/${venue.id}/recurring-schedules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0]).toMatchObject({ id: scheduleId, occurrenceCount: 3 });

    const detailResponse = await request(app.getHttpServer())
      .get(`/venues/mine/${venue.id}/recurring-schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(detailResponse.body.schedule.id).toBe(scheduleId);
    expect(detailResponse.body.occurrences).toHaveLength(3);
  });
});
