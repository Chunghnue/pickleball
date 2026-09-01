import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import {
  createUser, loginAs, createVenue, createCourt, createBooking, payBooking, createContact,
} from './utils/owner-fixtures';
import { UserRole } from '../src/users/entities/user.entity';

describe('GET /customers/:kind/:id (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => { app = await createTestApp(); ds = app.get(DataSource); });
  beforeEach(async () => { await clearDatabase(app); });
  afterAll(async () => { await app.close(); });

  it('returns registered customer detail with stats and joinedAt', async () => {
    const owner = await createUser(ds, 'owner@test.com', UserRole.OWNER);
    const registered = await createUser(ds, 'reg@test.com', UserRole.CUSTOMER);
    const venue = await createVenue(ds, owner.id, 'My Venue');
    const court = await createCourt(ds, venue.id, 'Court 1');
    const b = await createBooking(ds, court.id, { customerId: registered.id, totalPrice: 300000 });
    await payBooking(ds, b.id);

    const token = await loginAs(app, 'owner@test.com');
    const res = await request(app.getHttpServer())
      .get(`/customers/registered/${registered.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(res.body).toMatchObject({
      kind: 'registered',
      id: registered.id,
      email: 'reg@test.com',
      totalBookings: 1,
      totalSpent: 300000,
      tier: 'new',
    });
    expect(res.body.customerCode).toBe(`KH-${registered.id.slice(0, 8).toUpperCase()}`);
    expect(typeof res.body.joinedAt).toBe('string');
  });

  it('returns 404 for a registered user who never booked at the owner venues', async () => {
    const owner = await createUser(ds, 'owner@test.com', UserRole.OWNER);
    const stranger = await createUser(ds, 'stranger@test.com', UserRole.CUSTOMER);
    await createVenue(ds, owner.id, 'My Venue');
    const token = await loginAs(app, 'owner@test.com');
    await request(app.getHttpServer())
      .get(`/customers/registered/${stranger.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('returns walk-in detail including email/address/note', async () => {
    const owner = await createUser(ds, 'owner@test.com', UserRole.OWNER);
    const contact = await createContact(ds, owner.id, 'Walk In', '0900000009', {
      email: 'walk@test.com', address: '1 Nguyen Hue', note: 'VIP treatment',
    });
    const token = await loginAs(app, 'owner@test.com');
    const res = await request(app.getHttpServer())
      .get(`/customers/walkin/${contact.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toMatchObject({
      kind: 'walkin', id: contact.id, email: 'walk@test.com',
      address: '1 Nguyen Hue', note: 'VIP treatment', totalBookings: 0, tier: 'new',
    });
  });

  it("returns 404 for another owner's walk-in contact", async () => {
    await createUser(ds, 'owner@test.com', UserRole.OWNER);
    const other = await createUser(ds, 'other@test.com', UserRole.OWNER);
    const contact = await createContact(ds, other.id, 'Not Yours', '0900000010');
    const token = await loginAs(app, 'owner@test.com');
    await request(app.getHttpServer())
      .get(`/customers/walkin/${contact.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('returns 404 for an unknown kind', async () => {
    await createUser(ds, 'owner@test.com', UserRole.OWNER);
    const token = await loginAs(app, 'owner@test.com');
    await request(app.getHttpServer())
      .get('/customers/ghost/00000000-0000-0000-0000-000000000000')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });
});
