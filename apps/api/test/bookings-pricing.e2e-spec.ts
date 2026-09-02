import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court, CourtStatus } from '../src/courts/entities/court.entity';

describe('Booking price uses pricing rules (e2e)', () => {
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

  it('charges the pricing-rule price for a slot inside its window', async () => {
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
    const customer = await usersRepo.save(
      usersRepo.create({
        email: 'customer@test.com',
        passwordHash,
        fullName: 'Khách hàng',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const ownerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: 'owner@test.com', password: 'password123' });
    const ownerToken = ownerLogin.body.accessToken as string;
    const customerLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: 'customer@test.com', password: 'password123' });
    const customerToken = customerLogin.body.accessToken as string;

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
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        name: 'Buổi tối',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        startTime: '17:00',
        endTime: '22:00',
        price: 200000,
      })
      .expect(201);

    const bookingResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        courtId: court.id,
        date: '2099-01-01',
        startTime: '18:00',
        endTime: '19:00',
      })
      .expect(201);

    expect(bookingResponse.body.totalPrice).toBe(200000);
  });
});
