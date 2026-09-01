import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court, CourtStatus } from '../src/courts/entities/court.entity';

describe('Pricing summary (e2e)', () => {
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

  it('reports pricing rule count, active schedule count, and estimated monthly revenue', async () => {
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

    await request(app.getHttpServer())
      .post(`/venues/mine/${venue.id}/courts/${court.id}/pricing-rules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Buổi tối',
        daysOfWeek: [0, 1, 2, 3, 4],
        startTime: '17:00',
        endTime: '22:00',
        price: 150000,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/venues/mine/${venue.id}/recurring-schedules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        courtId: court.id,
        dayOfWeek: 0,
        startTime: '18:00',
        endTime: '19:00',
        pricePerSession: 120000,
        validFrom: '2099-01-05',
        validTo: '2099-01-05',
        newCustomer: { fullName: 'Khách quen', phone: '0933333333' },
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/venues/mine/${venue.id}/pricing-summary`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      pricingRulesCount: 1,
      activeRecurringSchedulesCount: 1,
      // 120000 * 52/12
      estimatedMonthlyRecurringRevenue: 520000,
    });
  });
});
