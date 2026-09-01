import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import {
  createUser, loginAs, createVenue, createCourt, createBooking, payBooking, createContact,
} from './utils/owner-fixtures';
import { UserRole } from '../src/users/entities/user.entity';

describe('GET /customers/summary (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => { app = await createTestApp(); ds = app.get(DataSource); });
  beforeEach(async () => { await clearDatabase(app); });
  afterAll(async () => { await app.close(); });

  it('rejects a non-owner with 403', async () => {
    await createUser(ds, 'cust@test.com', UserRole.CUSTOMER);
    const token = await loginAs(app, 'cust@test.com');
    await request(app.getHttpServer())
      .get('/customers/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('returns all-zero summary for an owner with no customers', async () => {
    await createUser(ds, 'empty@test.com', UserRole.OWNER);
    const token = await loginAs(app, 'empty@test.com');
    const res = await request(app.getHttpServer())
      .get('/customers/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({ totalCustomers: 0, vipCustomers: 0, totalBookings: 0, totalSpent: 0 });
  });

  it('aggregates registered + walk-in customers scoped to the owner', async () => {
    const owner = await createUser(ds, 'owner@test.com', UserRole.OWNER);
    const other = await createUser(ds, 'other@test.com', UserRole.OWNER);
    const registered = await createUser(ds, 'reg@test.com', UserRole.CUSTOMER);

    const venue = await createVenue(ds, owner.id, 'My Venue');
    const court = await createCourt(ds, venue.id, 'Court 1');
    const otherVenue = await createVenue(ds, other.id, 'Not Mine');
    const otherCourt = await createCourt(ds, otherVenue.id, 'Other Court');

    // registered: 2 bookings, one paid 300k
    const b1 = await createBooking(ds, court.id, { customerId: registered.id, totalPrice: 300000 });
    await payBooking(ds, b1.id);
    await createBooking(ds, court.id, { customerId: registered.id, totalPrice: 150000 });

    // walk-in owned by owner: 1 booking paid 200k
    const contact = await createContact(ds, owner.id, 'Walk In', '0900000009');
    const b2 = await createBooking(ds, court.id, { customerContactId: contact.id, totalPrice: 200000 });
    await payBooking(ds, b2.id);

    // noise on another owner's court — must be excluded
    const otherReg = await createUser(ds, 'noise@test.com', UserRole.CUSTOMER);
    const b3 = await createBooking(ds, otherCourt.id, { customerId: otherReg.id, totalPrice: 999999 });
    await payBooking(ds, b3.id);

    const token = await loginAs(app, 'owner@test.com');
    const res = await request(app.getHttpServer())
      .get('/customers/summary')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toEqual({
      totalCustomers: 2,      // 1 registered + 1 walk-in
      vipCustomers: 0,
      totalBookings: 3,       // 2 + 1
      totalSpent: 500000,     // 300k + 200k
    });
  });
});
