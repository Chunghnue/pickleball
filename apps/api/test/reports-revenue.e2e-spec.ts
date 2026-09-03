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
import { CustomerContact } from '../src/customer-contacts/entities/customer-contact.entity';

describe('Owner revenue report (e2e)', () => {
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

  async function createCourt(venueId: string, name: string): Promise<Court> {
    const repo = dataSource.getRepository(Court);
    return repo.save(
      repo.create({
        venueId,
        name,
        pricePerHour: 100000,
        openTime: '08:00',
        closeTime: '20:00',
        slotDurationMinutes: 60,
        status: CourtStatus.ACTIVE,
      }),
    );
  }

  async function createContact(
    ownerId: string,
    fullName: string,
    phone: string,
  ): Promise<CustomerContact> {
    const repo = dataSource.getRepository(CustomerContact);
    return repo.save(repo.create({ ownerId, fullName, phone }));
  }

  async function createBooking(
    courtId: string,
    totalPrice: number,
    date: string,
    customer: { customerId?: string; customerContactId?: string },
  ): Promise<Booking> {
    const repo = dataSource.getRepository(Booking);
    return repo.save(
      repo.create({
        courtId,
        customerId: customer.customerId ?? null,
        customerContactId: customer.customerContactId ?? null,
        date,
        startTime: '08:00',
        endTime: '09:00',
        totalPrice,
        status: BookingStatus.CONFIRMED,
      }),
    );
  }

  async function payBooking(
    bookingId: string,
    paidAt: Date,
    status: PaymentStatus = PaymentStatus.PAID,
  ): Promise<Payment> {
    const repo = dataSource.getRepository(Payment);
    return repo.save(repo.create({ bookingId, status, paidAt }));
  }

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer())
      .get('/reports/revenue?from=2026-08-01&to=2026-08-10')
      .expect(401);
  });

  it('rejects a non-owner, non-staff user with 403', async () => {
    await createUser('customer@test.com', UserRole.CUSTOMER);
    const token = await loginAs('customer@test.com');

    await request(app.getHttpServer())
      .get('/reports/revenue?from=2026-08-01&to=2026-08-10')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('rejects a malformed date and from > to with 400', async () => {
    await createUser('owner@test.com', UserRole.OWNER);
    const token = await loginAs('owner@test.com');

    await request(app.getHttpServer())
      .get('/reports/revenue?from=2026-08-10&to=08-2026-10')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);

    await request(app.getHttpServer())
      .get('/reports/revenue?from=2026-08-10&to=2026-08-01')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('returns 404 for a nonexistent venueId and 403 for a venueId owned by someone else', async () => {
    await createUser('owner1@test.com', UserRole.OWNER);
    const otherOwner = await createUser('owner2@test.com', UserRole.OWNER);
    const otherVenue = await createVenue(otherOwner.id, 'Other Venue');
    const token = await loginAs('owner1@test.com');

    await request(app.getHttpServer())
      .get(
        '/reports/revenue?from=2026-08-01&to=2026-08-10&venueId=00000000-0000-0000-0000-000000000000',
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(404);

    await request(app.getHttpServer())
      .get(`/reports/revenue?from=2026-08-01&to=2026-08-10&venueId=${otherVenue.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns an all-zero report when the owner has no venues', async () => {
    await createUser('empty-owner@test.com', UserRole.OWNER);
    const token = await loginAs('empty-owner@test.com');

    const response = await request(app.getHttpServer())
      .get('/reports/revenue?from=2026-08-01&to=2026-08-10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.currentPeriod).toEqual({
      revenue: 0,
      transactionCount: 0,
      avgPerTransaction: 0,
    });
    expect(response.body.previousPeriod).toEqual({ revenue: 0 });
    expect(response.body.changeAmount).toBe(0);
    expect(response.body.changePercent).toBeNull();
    expect(response.body.revenueByDay).toHaveLength(10);
    expect(response.body.revenueByDay.every((d: { revenue: number }) => d.revenue === 0)).toBe(
      true,
    );
    expect(response.body.transactions).toEqual([]);
  });

  it('aggregates current vs previous period, excludes refunded/unpaid/other-owner, and lists transactions in descending paidAt order', async () => {
    const owner = await createUser('owner1@test.com', UserRole.OWNER);
    const registeredCustomer = await createUser('customer@test.com', UserRole.CUSTOMER);
    const otherOwner = await createUser('owner2@test.com', UserRole.OWNER);

    const venue = await createVenue(owner.id, 'My Venue');
    const court = await createCourt(venue.id, 'Court 1');
    const contact = await createContact(owner.id, 'Trần Thị B', '0922222222');

    const otherVenue = await createVenue(otherOwner.id, 'Not Mine');
    const otherCourt = await createCourt(otherVenue.id, 'Other Court');

    // In current period [2026-08-01, 2026-08-10]
    const bookingA = await createBooking(court.id, 300000, '2026-08-05', {
      customerId: registeredCustomer.id,
    });
    const paymentA = await payBooking(bookingA.id, new Date(2026, 7, 5, 10, 0));

    const bookingB = await createBooking(court.id, 200000, '2026-08-01', {
      customerContactId: contact.id,
    });
    const paymentB = await payBooking(bookingB.id, new Date(2026, 7, 1, 0, 0, 1));

    const bookingI = await createBooking(court.id, 100000, '2026-08-10', {
      customerId: registeredCustomer.id,
    });
    const paymentI = await payBooking(bookingI.id, new Date(2026, 7, 10, 23, 30));

    // Just after the period — excluded
    const bookingH = await createBooking(court.id, 500000, '2026-08-11', {
      customerId: registeredCustomer.id,
    });
    await payBooking(bookingH.id, new Date(2026, 7, 11, 0, 0, 0));

    // Unpaid — excluded
    await createBooking(court.id, 400000, '2026-08-06', { customerId: registeredCustomer.id });

    // Refunded — excluded even though paidAt falls inside the period
    const bookingF = await createBooking(court.id, 700000, '2026-08-07', {
      customerId: registeredCustomer.id,
    });
    await payBooking(bookingF.id, new Date(2026, 7, 7, 12, 0), PaymentStatus.REFUNDED);

    // Other owner entirely — excluded by venue scoping
    const bookingG = await createBooking(otherCourt.id, 999999, '2026-08-05', {
      customerId: registeredCustomer.id,
    });
    await payBooking(bookingG.id, new Date(2026, 7, 5, 10, 0));

    // In the previous period [2026-07-22, 2026-07-31]
    const bookingC = await createBooking(court.id, 999999, '2026-07-31', {
      customerId: registeredCustomer.id,
    });
    await payBooking(bookingC.id, new Date(2026, 6, 31, 23, 59));

    const bookingD = await createBooking(court.id, 150000, '2026-07-25', {
      customerId: registeredCustomer.id,
    });
    await payBooking(bookingD.id, new Date(2026, 6, 25, 12, 0));

    const token = await loginAs('owner1@test.com');
    const response = await request(app.getHttpServer())
      .get('/reports/revenue?from=2026-08-01&to=2026-08-10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body.currentPeriod).toEqual({
      revenue: 600000,
      transactionCount: 3,
      avgPerTransaction: 200000,
    });
    expect(response.body.previousPeriod).toEqual({ revenue: 1149999 });
    expect(response.body.changeAmount).toBe(600000 - 1149999);
    expect(response.body.changePercent).toBeCloseTo(-47.8, 1);

    expect(response.body.revenueByDay).toHaveLength(10);
    const byDate = Object.fromEntries(
      response.body.revenueByDay.map((d: { date: string; revenue: number }) => [
        d.date,
        d.revenue,
      ]),
    );
    expect(byDate['2026-08-01']).toBe(200000);
    expect(byDate['2026-08-05']).toBe(300000);
    expect(byDate['2026-08-10']).toBe(100000);
    expect(byDate['2026-08-06']).toBe(0);

    expect(response.body.transactions).toHaveLength(3);
    expect(response.body.transactions.map((t: { id: string }) => t.id)).toEqual([
      paymentI.id,
      paymentA.id,
      paymentB.id,
    ]);
    expect(response.body.transactions[2]).toMatchObject({
      transactionCode: `GD-${paymentB.id.slice(0, 8).toUpperCase()}`,
      customerName: 'Trần Thị B',
      customerPhone: '0922222222',
      amount: 200000,
      status: 'paid',
    });
    expect(response.body.transactions[1]).toMatchObject({
      customerName: registeredCustomer.fullName,
      customerPhone: registeredCustomer.phone,
      amount: 300000,
    });
  });

  it('scopes to a single venue when venueId is provided', async () => {
    const owner = await createUser('owner1@test.com', UserRole.OWNER);
    const customer = await createUser('customer@test.com', UserRole.CUSTOMER);

    const venueA = await createVenue(owner.id, 'Venue A');
    const courtA = await createCourt(venueA.id, 'Court A');
    const venueB = await createVenue(owner.id, 'Venue B');
    const courtB = await createCourt(venueB.id, 'Court B');

    const bookingA = await createBooking(courtA.id, 200000, '2026-08-05', {
      customerId: customer.id,
    });
    await payBooking(bookingA.id, new Date(2026, 7, 5, 10, 0));
    const bookingB = await createBooking(courtB.id, 500000, '2026-08-05', {
      customerId: customer.id,
    });
    await payBooking(bookingB.id, new Date(2026, 7, 5, 10, 0));

    const token = await loginAs('owner1@test.com');

    const allResponse = await request(app.getHttpServer())
      .get('/reports/revenue?from=2026-08-01&to=2026-08-10')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(allResponse.body.currentPeriod.revenue).toBe(700000);

    const scopedResponse = await request(app.getHttpServer())
      .get(`/reports/revenue?from=2026-08-01&to=2026-08-10&venueId=${venueA.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(scopedResponse.body.currentPeriod.revenue).toBe(200000);
  });

  describe('GET /reports/revenue/export', () => {
    it('returns a CSV file with the same transactions as the JSON endpoint', async () => {
      const owner = await createUser('owner1@test.com', UserRole.OWNER);
      const customer = await createUser('customer@test.com', UserRole.CUSTOMER);
      const venue = await createVenue(owner.id, 'My Venue');
      const court = await createCourt(venue.id, 'Court 1');

      const booking = await createBooking(court.id, 250000, '2026-08-05', {
        customerId: customer.id,
      });
      const payment = await payBooking(booking.id, new Date(2026, 7, 5, 10, 30));

      const token = await loginAs('owner1@test.com');
      const response = await request(app.getHttpServer())
        .get('/reports/revenue/export?from=2026-08-01&to=2026-08-10')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain('attachment');
      expect(response.headers['content-disposition']).toContain(
        'doanh-thu-2026-08-01-den-2026-08-10.csv',
      );

      const body = response.text;
      expect(body.startsWith('﻿Mã GD,Khách hàng,SĐT,Thời gian,Số tiền,Trạng thái')).toBe(
        true,
      );
      expect(body).toContain(`GD-${payment.id.slice(0, 8).toUpperCase()}`);
      expect(body).toContain('05/08/2026 10:30');
      expect(body).toContain('250000');
    });

    it('rejects unauthenticated access with 401', async () => {
      await request(app.getHttpServer())
        .get('/reports/revenue/export?from=2026-08-01&to=2026-08-10')
        .expect(401);
    });
  });
});
