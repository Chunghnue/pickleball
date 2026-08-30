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

describe('Admin platform stats (e2e)', () => {
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

  async function createUser(
    email: string,
    role: UserRole,
    status: UserStatus,
  ): Promise<User> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const repo = dataSource.getRepository(User);
    return repo.save(
      repo.create({
        email,
        passwordHash,
        fullName: `User ${email}`,
        role,
        status,
        emailVerified: true,
      }),
    );
  }

  async function loginAs(email: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' });
    return response.body.accessToken as string;
  }

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer()).get('/admin/stats').expect(401);
  });

  it('rejects a non-admin active user with 403', async () => {
    await createUser('owner1@test.com', UserRole.OWNER, UserStatus.ACTIVE);
    const token = await loginAs('owner1@test.com');

    await request(app.getHttpServer())
      .get('/admin/stats')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('aggregates counts and revenue across the whole platform', async () => {
    await createUser('admin@test.com', UserRole.ADMIN, UserStatus.ACTIVE);
    const activeOwner = await createUser(
      'active-owner@test.com',
      UserRole.OWNER,
      UserStatus.ACTIVE,
    );
    await createUser(
      'pending-owner@test.com',
      UserRole.OWNER,
      UserStatus.PENDING_APPROVAL,
    );
    const customer = await createUser(
      'customer@test.com',
      UserRole.CUSTOMER,
      UserStatus.ACTIVE,
    );

    const venuesRepo = dataSource.getRepository(Venue);
    const activeVenue = await venuesRepo.save(
      venuesRepo.create({
        ownerId: activeOwner.id,
        name: 'Active Venue',
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.ACTIVE,
      }),
    );
    await venuesRepo.save(
      venuesRepo.create({
        ownerId: activeOwner.id,
        name: 'Pending Venue',
        address: '456 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.PENDING_APPROVAL,
      }),
    );

    const courtsRepo = dataSource.getRepository(Court);
    const activeCourt = await courtsRepo.save(
      courtsRepo.create({
        venueId: activeVenue.id,
        name: 'Court 1',
        pricePerHour: 100000,
        openTime: '08:00',
        closeTime: '20:00',
        slotDurationMinutes: 60,
        status: CourtStatus.ACTIVE,
      }),
    );
    await courtsRepo.save(
      courtsRepo.create({
        venueId: activeVenue.id,
        name: 'Court 2',
        pricePerHour: 100000,
        openTime: '08:00',
        closeTime: '20:00',
        slotDurationMinutes: 60,
        status: CourtStatus.CLOSED,
      }),
    );

    const bookingsRepo = dataSource.getRepository(Booking);
    const paymentsRepo = dataSource.getRepository(Payment);

    const paidBookingToday = await bookingsRepo.save(
      bookingsRepo.create({
        courtId: activeCourt.id,
        customerId: customer.id,
        date: '2026-08-26',
        startTime: '08:00',
        endTime: '09:00',
        totalPrice: 300000,
        status: BookingStatus.CONFIRMED,
      }),
    );
    await paymentsRepo.save(
      paymentsRepo.create({
        bookingId: paidBookingToday.id,
        status: PaymentStatus.PAID,
        paidAt: new Date(),
      }),
    );

    await bookingsRepo.save(
      bookingsRepo.create({
        courtId: activeCourt.id,
        customerId: customer.id,
        date: '2026-08-26',
        startTime: '10:00',
        endTime: '11:00',
        totalPrice: 150000,
        status: BookingStatus.CONFIRMED,
      }),
    );

    const adminToken = await loginAs('admin@test.com');
    const response = await request(app.getHttpServer())
      .get('/admin/stats')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(response.body.owners).toEqual({
      total: 2,
      active: 1,
      pendingApproval: 1,
    });
    expect(response.body.venues).toEqual({
      total: 2,
      active: 1,
      pendingApproval: 1,
    });
    expect(response.body.courts).toEqual({ total: 2, active: 1 });
    expect(response.body.todayBookingsCount).toBe(2);
    expect(response.body.todayRevenue).toBe(300000);
    expect(response.body.newCustomersThisMonth).toBe(1);
    expect(response.body.revenueByDay).toHaveLength(30);

    const revenueSum = response.body.revenueByDay.reduce(
      (sum: number, day: { revenue: number }) => sum + day.revenue,
      0,
    );
    expect(revenueSum).toBe(300000);
  });
});
