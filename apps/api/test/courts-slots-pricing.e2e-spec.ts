import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court, CourtStatus } from '../src/courts/entities/court.entity';

describe('GET /courts/:id/slots reflects pricing rules (e2e)', () => {
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

  it('uses the pricing rule price for slots inside its window and the court default outside it', async () => {
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
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startTime: '17:00',
        endTime: '22:00',
        price: 200000,
      })
      .expect(201);

    // Far-future date so the test doesn't rot into "past date" as real time passes;
    // daysOfWeek: [0..6] above matches every weekday, so its exact day-of-week doesn't matter.
    const response = await request(app.getHttpServer())
      .get(`/courts/${court.id}/slots?date=2099-01-01`)
      .expect(200);

    const morningSlot = response.body.find((slot: { start: string }) => slot.start === '08:00');
    const eveningSlot = response.body.find((slot: { start: string }) => slot.start === '18:00');
    expect(morningSlot.price).toBe(100000);
    expect(eveningSlot.price).toBe(200000);
  });
});
