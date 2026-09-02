import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court, CourtStatus } from '../src/courts/entities/court.entity';
import { Booking, BookingStatus } from '../src/bookings/entities/booking.entity';
import { Payment, PaymentStatus } from '../src/payments/entities/payment.entity';

describe('Owner dashboard summary (e2e)', () => {
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

  let phoneCounter = 0;

  async function createUser(
    email: string,
    role: UserRole,
    status: UserStatus = UserStatus.ACTIVE,
  ): Promise<User> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const repo = dataSource.getRepository(User);
    phoneCounter += 1;
    return repo.save(
      repo.create({
        email,
        passwordHash,
        fullName: `User ${email}`,
        phone: `090${String(phoneCounter).padStart(7, '0')}`,
        role,
        status,
        emailVerified: true,
      }),
    );
  }

  async function loginAs(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: email, password: 'password123' });
    return response.body.accessToken as string;
  }

  async function createVenue(ownerId: string, name: string): Promise<Venue> {
    const repo = dataSource.getRepository(Venue);
    return repo.save(
      repo.create({
        ownerId,
        name,
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.ACTIVE,
      }),
    );
  }

  async function createCourt(
    venueId: string,
    name: string,
    isActive = true,
  ): Promise<Court> {
    const repo = dataSource.getRepository(Court);
    return repo.save(
      repo.create({
        venueId,
        name,
        pricePerHour: 100000,
        openTime: '08:00',
        closeTime: '20:00',
        slotDurationMinutes: 60,
        status: isActive ? CourtStatus.ACTIVE : CourtStatus.CLOSED,
      }),
    );
  }

  async function createBooking(
    courtId: string,
    customerId: string,
    totalPrice: number,
  ): Promise<Booking> {
    const repo = dataSource.getRepository(Booking);
    return repo.save(
      repo.create({
        courtId,
        customerId,
        date: '2026-08-29',
        startTime: '08:00',
        endTime: '09:00',
        totalPrice,
        status: BookingStatus.CONFIRMED,
      }),
    );
  }

  async function payBooking(bookingId: string): Promise<Payment> {
    const repo = dataSource.getRepository(Payment);
    return repo.save(
      repo.create({
        bookingId,
        status: PaymentStatus.PAID,
        paidAt: new Date(),
      }),
    );
  }

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer()).get('/dashboard/summary').expect(401);
  });

  it('rejects a non-owner active user with 403', async () => {
    await createUser('customer@test.com', UserRole.CUSTOMER);
    const token = await loginAs('customer@test.com');

    await request(app.getHttpServer())
      .get('/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns an all-zero summary when the owner has no venues', async () => {
    await createUser('empty-owner@test.com', UserRole.OWNER);
    const token = await loginAs('empty-owner@test.com');

    const response = await request(app.getHttpServer())
      .get('/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.todayBookingsCount).toBe(0);
    expect(response.body.todayRevenue).toBe(0);
    expect(response.body.courts).toEqual({ active: 0, total: 0 });
    expect(response.body.newCustomersThisMonth).toBe(0);
    expect(response.body.revenueByDay).toHaveLength(30);
    expect(response.body.revenueByDay.every((d: { revenue: number }) => d.revenue === 0)).toBe(true);
    expect(response.body.revenueByCourt).toEqual([]);
    expect(response.body.recentBookings).toEqual([]);
  });

  it('returns 404 for a nonexistent venueId and 403 for a venueId owned by someone else', async () => {
    await createUser('owner1@test.com', UserRole.OWNER);
    const otherOwner = await createUser('owner2@test.com', UserRole.OWNER);
    const otherVenue = await createVenue(otherOwner.id, 'Other Venue');
    const token = await loginAs('owner1@test.com');

    await request(app.getHttpServer())
      .get('/dashboard/summary?venueId=00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/dashboard/summary?venueId=${otherVenue.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('aggregates bookings, revenue, courts, new customers, revenue-by-court and recent bookings scoped to the owner\'s own venues', async () => {
    const owner = await createUser('owner1@test.com', UserRole.OWNER);
    const otherOwner = await createUser('owner2@test.com', UserRole.OWNER);
    const customer = await createUser('customer@test.com', UserRole.CUSTOMER);

    const venue = await createVenue(owner.id, 'My Venue');
    const courtWithRevenue = await createCourt(venue.id, 'Court 1', true);
    const courtNoRevenue = await createCourt(venue.id, 'Court 2', false);

    const otherVenue = await createVenue(otherOwner.id, 'Not Mine');
    const otherCourt = await createCourt(otherVenue.id, 'Other Court', true);

    const paidBooking = await createBooking(courtWithRevenue.id, customer.id, 300000);
    await payBooking(paidBooking.id);
    await createBooking(courtWithRevenue.id, customer.id, 150000);

    const otherBooking = await createBooking(otherCourt.id, customer.id, 999999);
    await payBooking(otherBooking.id);

    const token = await loginAs('owner1@test.com');
    const response = await request(app.getHttpServer())
      .get('/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.todayBookingsCount).toBe(2);
    expect(response.body.todayRevenue).toBe(300000);
    expect(response.body.courts).toEqual({ active: 1, total: 2 });
    expect(response.body.newCustomersThisMonth).toBe(1);

    expect(response.body.revenueByDay).toHaveLength(30);
    const revenueSum = response.body.revenueByDay.reduce(
      (sum: number, day: { revenue: number }) => sum + day.revenue,
      0,
    );
    expect(revenueSum).toBe(300000);

    expect(response.body.revenueByCourt).toEqual(
      expect.arrayContaining([
        { courtId: courtWithRevenue.id, courtName: 'Court 1', revenue: 300000 },
        { courtId: courtNoRevenue.id, courtName: 'Court 2', revenue: 0 },
      ]),
    );
    expect(response.body.revenueByCourt).toHaveLength(2);

    expect(response.body.recentBookings).toHaveLength(2);
    const recent = response.body.recentBookings[0];
    expect(recent).toMatchObject({
      customerName: customer.fullName,
      customerPhone: customer.phone,
      courtName: 'Court 1',
      date: '2026-08-29',
      startTime: '08:00',
      endTime: '09:00',
      status: 'confirmed',
    });
    expect([300000, 150000]).toContain(recent.totalPrice);
  });

  it('filters to a single venue when venueId is provided, for an owner with multiple venues', async () => {
    const owner = await createUser('owner1@test.com', UserRole.OWNER);
    const customer = await createUser('customer@test.com', UserRole.CUSTOMER);

    const venueA = await createVenue(owner.id, 'Venue A');
    const courtA = await createCourt(venueA.id, 'Court A', true);
    const venueB = await createVenue(owner.id, 'Venue B');
    const courtB = await createCourt(venueB.id, 'Court B', true);

    const bookingA = await createBooking(courtA.id, customer.id, 200000);
    await payBooking(bookingA.id);
    const bookingB = await createBooking(courtB.id, customer.id, 500000);
    await payBooking(bookingB.id);

    const token = await loginAs('owner1@test.com');

    const allResponse = await request(app.getHttpServer())
      .get('/dashboard/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(allResponse.body.todayRevenue).toBe(700000);
    expect(allResponse.body.courts).toEqual({ active: 2, total: 2 });

    const scopedResponse = await request(app.getHttpServer())
      .get(`/dashboard/summary?venueId=${venueA.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(scopedResponse.body.todayRevenue).toBe(200000);
    expect(scopedResponse.body.courts).toEqual({ active: 1, total: 1 });
    expect(scopedResponse.body.revenueByCourt).toEqual([
      { courtId: courtA.id, courtName: 'Court A', revenue: 200000 },
    ]);
  });
});
