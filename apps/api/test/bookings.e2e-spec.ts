import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court, CourtStatus } from '../src/courts/entities/court.entity';
import { Booking } from '../src/bookings/entities/booking.entity';

describe('Bookings (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await clearDatabase(app);
    mockMailService.send.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  async function createActiveUserAndLogin(
    email: string,
    role: UserRole,
  ): Promise<{ userId: string; token: string }> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const repo = dataSource.getRepository(User);
    const user = await repo.save(
      repo.create({
        email,
        passwordHash,
        fullName: 'Test User',
        role,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: email, password: 'password123' });
    return {
      userId: user.id,
      token: loginResponse.body.accessToken as string,
    };
  }

  async function createActiveVenueAndCourt(
    ownerId: string,
    cancellationCutoffHours = 2,
  ): Promise<{ venueId: string; courtId: string }> {
    const venuesRepo = dataSource.getRepository(Venue);
    const venue = await venuesRepo.save(
      venuesRepo.create({
        ownerId,
        name: 'Sân ABC',
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.ACTIVE,
        cancellationCutoffHours,
      }),
    );
    const courtsRepo = dataSource.getRepository(Court);
    const court = await courtsRepo.save(
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
    return { venueId: venue.id, courtId: court.id };
  }

  it('books a slot, shows it as booked in availability, and lists it under /bookings/mine', async () => {
    const owner = await createActiveUserAndLogin(
      'owner1@test.com',
      UserRole.OWNER,
    );
    const { courtId } = await createActiveVenueAndCourt(owner.userId);
    const customer = await createActiveUserAndLogin(
      'customer1@test.com',
      UserRole.CUSTOMER,
    );

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        courtId,
        date: '2099-01-01',
        startTime: '08:00',
        endTime: '09:00',
      })
      .expect(201);

    expect(createResponse.body).toMatchObject({
      courtId,
      status: 'confirmed',
      totalPrice: 100000,
    });
    expect(mockMailService.send).toHaveBeenCalledWith(
      'customer1@test.com',
      'Xác nhận đặt sân',
      expect.stringContaining('Sân 1'),
    );
    expect(mockMailService.send).toHaveBeenCalledWith(
      'owner1@test.com',
      'Có booking mới',
      expect.stringContaining('Sân 1'),
    );

    const availability = await request(app.getHttpServer())
      .get('/bookings/availability')
      .query({ courtId, date: '2099-01-01' })
      .expect(200);
    expect(availability.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          start: '08:00',
          end: '09:00',
          isBooked: true,
        }),
        expect.objectContaining({ start: '09:00', isBooked: false }),
      ]),
    );

    const mine = await request(app.getHttpServer())
      .get('/bookings/mine')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(mine.body).toHaveLength(1);
    expect(mine.body[0].id).toBe(createResponse.body.id);
  });

  it('rejects a concurrent second booking for the same slot with 409', async () => {
    const owner = await createActiveUserAndLogin(
      'owner2@test.com',
      UserRole.OWNER,
    );
    const { courtId } = await createActiveVenueAndCourt(owner.userId);
    const customerA = await createActiveUserAndLogin(
      'customerA@test.com',
      UserRole.CUSTOMER,
    );
    const customerB = await createActiveUserAndLogin(
      'customerB@test.com',
      UserRole.CUSTOMER,
    );

    const [responseA, responseB] = await Promise.all([
      request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${customerA.token}`)
        .send({
          courtId,
          date: '2099-01-02',
          startTime: '08:00',
          endTime: '09:00',
        }),
      request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${customerB.token}`)
        .send({
          courtId,
          date: '2099-01-02',
          startTime: '08:00',
          endTime: '09:00',
        }),
    ]);

    const statuses = [responseA.status, responseB.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it('blocks customer cancellation inside the cutoff window but allows owner cancellation', async () => {
    const owner = await createActiveUserAndLogin(
      'owner3@test.com',
      UserRole.OWNER,
    );
    const { venueId, courtId } = await createActiveVenueAndCourt(
      owner.userId,
      2,
    );
    const customer = await createActiveUserAndLogin(
      'customer3@test.com',
      UserRole.CUSTOMER,
    );

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        courtId,
        date: '2099-01-03',
        startTime: '08:00',
        endTime: '09:00',
      })
      .expect(201);
    const bookingId = createResponse.body.id;

    // Pin the booking to ~30 minutes from now — comfortably inside the
    // 2-hour cutoff — instead of relying on the far-future date used for
    // creation, so the cutoff check is deterministic regardless of when
    // this test runs.
    const soon = new Date(Date.now() + 30 * 60 * 1000);
    await dataSource.getRepository(Booking).update(bookingId, {
      date: soon.toISOString().slice(0, 10),
      startTime: soon.toISOString().slice(11, 16),
    });

    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(403);

    await request(app.getHttpServer())
      .post(`/venues/mine/${venueId}/bookings/${bookingId}/cancel`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(201);
    expect(mockMailService.send).toHaveBeenCalledWith(
      'customer3@test.com',
      'Booking đã được huỷ',
      expect.any(String),
    );

    const availability = await request(app.getHttpServer())
      .get('/bookings/availability')
      .query({ courtId, date: '2099-01-03' })
      .expect(200);
    expect(availability.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ start: '08:00', isBooked: false }),
      ]),
    );
  });

  it('lists venue bookings for the owner', async () => {
    const owner = await createActiveUserAndLogin(
      'owner4@test.com',
      UserRole.OWNER,
    );
    const { venueId, courtId } = await createActiveVenueAndCourt(owner.userId);
    const customer = await createActiveUserAndLogin(
      'customer4@test.com',
      UserRole.CUSTOMER,
    );
    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        courtId,
        date: '2099-01-04',
        startTime: '08:00',
        endTime: '09:00',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/bookings`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ courtId, date: '2099-01-04' });
  });
});
