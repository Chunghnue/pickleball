import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court } from '../src/courts/entities/court.entity';
import { Booking, BookingStatus } from '../src/bookings/entities/booking.entity';
import { Payment, PaymentStatus } from '../src/payments/entities/payment.entity';

describe('Disputes (e2e)', () => {
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

  async function createUser(
    email: string,
    role: UserRole,
  ): Promise<{ user: User; token: string }> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const repo = dataSource.getRepository(User);
    const user = await repo.save(
      repo.create({
        email,
        passwordHash,
        fullName: `User ${email}`,
        role,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' });
    return { user, token: loginResponse.body.accessToken as string };
  }

  // Only inserts the row — venue ownership never requires the owner to log
  // in during these tests, and /auth/login is throttled to 10 req/60s, so
  // avoid burning that budget on tokens no test actually uses.
  async function createOwnerWithoutLogin(email: string): Promise<User> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const repo = dataSource.getRepository(User);
    return repo.save(
      repo.create({
        email,
        passwordHash,
        fullName: `User ${email}`,
        role: UserRole.OWNER,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
  }

  async function createPaidBooking(
    ownerId: string,
    customerId: string,
  ): Promise<{ bookingId: string }> {
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
    const court = await courtsRepo.save(
      courtsRepo.create({
        venueId: venue.id,
        name: 'Sân 1',
        pricePerHour: 100000,
        openTime: '08:00',
        closeTime: '20:00',
        slotDurationMinutes: 60,
        isActive: true,
      }),
    );
    const bookingsRepo = dataSource.getRepository(Booking);
    const booking = await bookingsRepo.save(
      bookingsRepo.create({
        courtId: court.id,
        customerId,
        date: '2026-09-01',
        startTime: '08:00',
        endTime: '09:00',
        totalPrice: 300000,
        status: BookingStatus.CONFIRMED,
      }),
    );
    const paymentsRepo = dataSource.getRepository(Payment);
    await paymentsRepo.save(
      paymentsRepo.create({
        bookingId: booking.id,
        status: PaymentStatus.PAID,
        paidAt: new Date(),
      }),
    );
    return { bookingId: booking.id };
  }

  it('lets a customer file a dispute on a paid booking, and it appears in the admin queue', async () => {
    const owner = await createOwnerWithoutLogin('owner1@test.com');
    const customer = await createUser('customer1@test.com', UserRole.CUSTOMER);
    const admin = await createUser('admin1@test.com', UserRole.ADMIN);
    const { bookingId } = await createPaidBooking(owner.id, customer.user.id);

    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/disputes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Bị tính sai tiền' })
      .expect(201);

    const listResponse = await request(app.getHttpServer())
      .get('/admin/disputes')
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);

    expect(listResponse.body).toHaveLength(1);
    expect(listResponse.body[0]).toMatchObject({
      status: 'pending',
      reason: 'Bị tính sai tiền',
      customer: { email: 'customer1@test.com' },
      booking: { id: bookingId, courtName: 'Sân 1', venueName: 'Sân ABC' },
    });
  });

  it('rejects filing a second dispute for the same booking with 409', async () => {
    const owner = await createOwnerWithoutLogin('owner2@test.com');
    const customer = await createUser('customer2@test.com', UserRole.CUSTOMER);
    const { bookingId } = await createPaidBooking(owner.id, customer.user.id);

    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/disputes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Lần 1' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/disputes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Lần 2' })
      .expect(409);
  });

  it('resolves a dispute as refund: payment becomes refunded and the customer is emailed', async () => {
    const owner = await createOwnerWithoutLogin('owner3@test.com');
    const customer = await createUser('customer3@test.com', UserRole.CUSTOMER);
    const admin = await createUser('admin3@test.com', UserRole.ADMIN);
    const { bookingId } = await createPaidBooking(owner.id, customer.user.id);

    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/disputes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Bị tính sai tiền' })
      .expect(201);
    const disputeId = (
      await dataSource.query('SELECT id FROM disputes WHERE booking_id = $1', [
        bookingId,
      ])
    )[0].id as string;

    await request(app.getHttpServer())
      .post(`/admin/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ action: 'refund', note: 'Đã xác minh' })
      .expect(201);

    const payment = await dataSource
      .getRepository(Payment)
      .findOneOrFail({ where: { bookingId } });
    expect(payment.status).toBe(PaymentStatus.REFUNDED);
    expect(payment.refundedBy).toBe(admin.user.id);

    const call = mockMailService.send.mock.calls.find(
      ([to]) => to === 'customer3@test.com',
    );
    expect(call).toBeDefined();
  });

  it('resolves a dispute as reject: payment is untouched, customer emailed with the note', async () => {
    const owner = await createOwnerWithoutLogin('owner4@test.com');
    const customer = await createUser('customer4@test.com', UserRole.CUSTOMER);
    const admin = await createUser('admin4@test.com', UserRole.ADMIN);
    const { bookingId } = await createPaidBooking(owner.id, customer.user.id);

    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/disputes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Bị tính sai tiền' })
      .expect(201);
    const disputeId = (
      await dataSource.query('SELECT id FROM disputes WHERE booking_id = $1', [
        bookingId,
      ])
    )[0].id as string;

    await request(app.getHttpServer())
      .post(`/admin/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ action: 'reject', note: 'Không đủ căn cứ' })
      .expect(201);

    const payment = await dataSource
      .getRepository(Payment)
      .findOneOrFail({ where: { bookingId } });
    expect(payment.status).toBe(PaymentStatus.PAID);

    const call = mockMailService.send.mock.calls.find(
      ([to]) => to === 'customer4@test.com',
    );
    expect(call).toBeDefined();
    expect(call![2]).toContain('Không đủ căn cứ');
  });

  it('rejects resolving an already-resolved dispute with 400', async () => {
    const owner = await createOwnerWithoutLogin('owner5@test.com');
    const customer = await createUser('customer5@test.com', UserRole.CUSTOMER);
    const admin = await createUser('admin5@test.com', UserRole.ADMIN);
    const { bookingId } = await createPaidBooking(owner.id, customer.user.id);

    await request(app.getHttpServer())
      .post(`/bookings/${bookingId}/disputes`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Bị tính sai tiền' })
      .expect(201);
    const disputeId = (
      await dataSource.query('SELECT id FROM disputes WHERE booking_id = $1', [
        bookingId,
      ])
    )[0].id as string;

    await request(app.getHttpServer())
      .post(`/admin/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ action: 'reject' })
      .expect(201);

    await request(app.getHttpServer())
      .post(`/admin/disputes/${disputeId}/resolve`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ action: 'reject' })
      .expect(400);
  });

  it('rejects a non-admin calling the admin endpoint with 403', async () => {
    const customer = await createUser('customer6@test.com', UserRole.CUSTOMER);

    await request(app.getHttpServer())
      .get('/admin/disputes')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(403);
  });

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer()).get('/admin/disputes').expect(401);
    await request(app.getHttpServer()).get('/disputes/mine').expect(401);
  });
});
