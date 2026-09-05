import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import {
  createTestApp,
  clearDatabase,
  mockMailService,
} from './utils/test-app';
import {
  StaffRole,
  User,
  UserRole,
  UserStatus,
} from '../src/users/entities/user.entity';
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

  // Signs a JWT directly instead of going through /auth/login — that endpoint
  // is throttled to 10 req/60s and this file's other tests already use the
  // full budget (see the cashier test below for the original precedent).
  async function createActiveUserWithToken(
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
    const jwtService = app.get(JwtService);
    const token = await jwtService.signAsync({
      sub: user.id,
      role,
      ownerId: null,
      staffRole: null,
    });
    return { userId: user.id, token };
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
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
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
          contactName: 'Nguyễn Văn A',
          contactPhone: '0900000000',
        }),
      request(app.getHttpServer())
        .post('/bookings')
        .set('Authorization', `Bearer ${customerB.token}`)
        .send({
          courtId,
          date: '2099-01-02',
          startTime: '08:00',
          endTime: '09:00',
          contactName: 'Nguyễn Văn B',
          contactPhone: '0900000001',
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
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
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
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
      })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/bookings`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(response.body).toHaveLength(1);
    expect(response.body[0]).toMatchObject({ courtId, date: '2099-01-04' });
  });

  it('lets a cashier staff create and cancel an owner-facing booking (operational tier)', async () => {
    const owner = await createActiveUserAndLogin(
      'bookingsowner-staff@test.com',
      UserRole.OWNER,
    );
    const { venueId, courtId } = await createActiveVenueAndCourt(owner.userId);
    const passwordHash = await bcrypt.hash('password123', 10);
    const usersRepo = dataSource.getRepository(User);
    const cashier = await usersRepo.save(
      usersRepo.create({
        fullName: 'Cashier',
        phone: '0911000010',
        email: null,
        passwordHash,
        role: UserRole.STAFF,
        ownerId: owner.userId,
        staffRole: StaffRole.CASHIER,
        status: UserStatus.ACTIVE,
        emailVerified: false,
      }),
    );
    // Signs the JWT directly instead of going through /auth/login — that
    // endpoint is throttled to 10 req/60s and this file's other tests
    // already use the full budget; login-by-phone itself is covered by
    // staff.e2e-spec.ts.
    const jwtService = app.get(JwtService);
    const cashierToken = await jwtService.signAsync({
      sub: cashier.id,
      role: UserRole.STAFF,
      ownerId: owner.userId,
      staffRole: StaffRole.CASHIER,
    });

    const createResponse = await request(app.getHttpServer())
      .post(`/venues/mine/${venueId}/bookings`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({
        courtId,
        date: '2099-03-01',
        startTime: '08:00',
        endTime: '09:00',
        newCustomer: { fullName: 'Khách vãng lai', phone: '0922000001' },
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/venues/mine/${venueId}/bookings/${createResponse.body.id}/cancel`)
      .set('Authorization', `Bearer ${cashierToken}`)
      .expect(201);
  });

  it('lets a guest without an account book a slot using contact info, and sends a confirmation email when provided', async () => {
    const owner = await createActiveUserWithToken(
      'owner5@test.com',
      UserRole.OWNER,
    );
    const { venueId, courtId } = await createActiveVenueAndCourt(owner.userId);

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .send({
        courtId,
        date: '2099-05-01',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Khách vãng lai',
        contactPhone: '0911111111',
        contactEmail: 'guest@test.com',
      })
      .expect(201);

    expect(createResponse.body).toMatchObject({
      courtId,
      status: 'confirmed',
      customerId: null,
      contactName: 'Khách vãng lai',
      contactPhone: '0911111111',
    });
    expect(mockMailService.send).toHaveBeenCalledWith(
      'guest@test.com',
      'Xác nhận đặt sân',
      expect.stringContaining('Sân 1'),
    );

    const ownerBookings = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/bookings`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(ownerBookings.body[0]).toMatchObject({
      customerName: 'Khách vãng lai',
      customerPhone: '0911111111',
    });
  });

  it('does not send a guest confirmation email when contactEmail is omitted', async () => {
    const owner = await createActiveUserWithToken(
      'owner6@test.com',
      UserRole.OWNER,
    );
    const { courtId } = await createActiveVenueAndCourt(owner.userId);

    await request(app.getHttpServer())
      .post('/bookings')
      .send({
        courtId,
        date: '2099-05-02',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Khách vãng lai 2',
        contactPhone: '0911111112',
      })
      .expect(201);

    expect(mockMailService.send).not.toHaveBeenCalledWith(
      expect.anything(),
      'Xác nhận đặt sân',
      expect.anything(),
    );
    expect(mockMailService.send).toHaveBeenCalledWith(
      'owner6@test.com',
      'Có booking mới',
      expect.any(String),
    );
  });

  it('lets a logged-in customer override the display contact info while keeping the booking linked to their account', async () => {
    const owner = await createActiveUserWithToken(
      'owner7@test.com',
      UserRole.OWNER,
    );
    const { venueId, courtId } = await createActiveVenueAndCourt(owner.userId);
    const customer = await createActiveUserWithToken(
      'customer7@test.com',
      UserRole.CUSTOMER,
    );

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        courtId,
        date: '2099-05-03',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Đặt hộ bạn',
        contactPhone: '0911111113',
      })
      .expect(201);

    const mine = await request(app.getHttpServer())
      .get('/bookings/mine')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(mine.body.map((b: { id: string }) => b.id)).toContain(
      createResponse.body.id,
    );

    const ownerBookings = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/bookings`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(ownerBookings.body[0]).toMatchObject({
      customerName: 'Đặt hộ bạn',
      customerPhone: '0911111113',
    });
  });
});
