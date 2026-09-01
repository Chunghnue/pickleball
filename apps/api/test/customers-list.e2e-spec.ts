import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import {
  createUser, loginAs, createVenue, createCourt, createBooking, createContact,
} from './utils/owner-fixtures';
import { UserRole } from '../src/users/entities/user.entity';

describe('GET /customers (e2e)', () => {
  let app: INestApplication;
  let ds: DataSource;

  beforeAll(async () => { app = await createTestApp(); ds = app.get(DataSource); });
  beforeEach(async () => { await clearDatabase(app); });
  afterAll(async () => { await app.close(); });

  async function seedOwnerWithThreeWalkins() {
    const owner = await createUser(ds, 'owner@test.com', UserRole.OWNER);
    const venue = await createVenue(ds, owner.id, 'My Venue');
    const court = await createCourt(ds, venue.id, 'Court 1');
    // c1: booked 2026-08-20; c2: booked 2026-08-25; c3: never booked
    const c1 = await createContact(ds, owner.id, 'Alpha', '0911111111');
    const c2 = await createContact(ds, owner.id, 'Bravo', '0922222222');
    await createContact(ds, owner.id, 'Charlie', '0933333333');
    await createBooking(ds, court.id, { customerContactId: c1.id, date: '2026-08-20' });
    await createBooking(ds, court.id, { customerContactId: c2.id, date: '2026-08-25' });
    return { court };
  }

  it('returns 400 for an invalid tier', async () => {
    await createUser(ds, 'owner@test.com', UserRole.OWNER);
    const token = await loginAs(app, 'owner@test.com');
    await request(app.getHttpServer())
      .get('/customers?tier=platinum')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
  });

  it('sorts by lastBookingAt desc with never-booked customers last', async () => {
    await seedOwnerWithThreeWalkins();
    const token = await loginAs(app, 'owner@test.com');
    const res = await request(app.getHttpServer())
      .get('/customers')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.total).toBe(3);
    expect(res.body.items.map((c: { fullName: string }) => c.fullName)).toEqual([
      'Bravo', 'Alpha', 'Charlie',
    ]);
    expect(res.body.items[0].customerCode).toMatch(/^KH-[0-9A-F]{8}$/);
  });

  it('paginates and clamps pageSize to 100', async () => {
    await seedOwnerWithThreeWalkins();
    const token = await loginAs(app, 'owner@test.com');

    const page1 = await request(app.getHttpServer())
      .get('/customers?page=1&pageSize=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(page1.body.items).toHaveLength(2);
    expect(page1.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });

    const page2 = await request(app.getHttpServer())
      .get('/customers?page=2&pageSize=2')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(page2.body.items).toHaveLength(1);

    const clamped = await request(app.getHttpServer())
      .get('/customers?pageSize=999')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(clamped.body.pageSize).toBe(100);
  });

  it('filters by search on phone', async () => {
    await seedOwnerWithThreeWalkins();
    const token = await loginAs(app, 'owner@test.com');
    const res = await request(app.getHttpServer())
      .get('/customers?search=0922222222')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].fullName).toBe('Bravo');
  });

  it('filters by tier=new', async () => {
    await seedOwnerWithThreeWalkins();
    const token = await loginAs(app, 'owner@test.com');
    const res = await request(app.getHttpServer())
      .get('/customers?tier=new')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // all three have <=1 booking → all "new"
    expect(res.body.total).toBe(3);
  });
});
