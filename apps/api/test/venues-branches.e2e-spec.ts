import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { createUser, loginAs, createVenue, createCourt, createBooking, createContact } from './utils/owner-fixtures';
import { UserRole } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { VenueSlugHistory } from '../src/courts/entities/venue-slug-history.entity';

describe('Branches (venues) e2e', () => {
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

  async function ownerAndToken() {
    const owner = await createUser(dataSource, 'owner@test.com', UserRole.OWNER);
    const token = await loginAs(app, 'owner@test.com');
    return { ownerId: owner.id, token };
  }

  it('POST /venues auto-generates a unique slug and marks the first venue as default', async () => {
    const { token } = await ownerAndToken();

    const response = await request(app.getHttpServer())
      .post('/venues')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Sân Đình Văn Chung', address: '1 Le Loi', city: 'Ho Chi Minh' })
      .expect(201);

    expect(response.body.slug).toBe('san-dinh-van-chung');
    expect(response.body.isDefault).toBe(true);
  });

  it('changing the slug makes the old one 404 and the new one resolve via by-slug', async () => {
    const { ownerId, token } = await ownerAndToken();
    const venuesRepo = dataSource.getRepository(Venue);
    const venue = await venuesRepo.save(
      venuesRepo.create({
        ownerId,
        name: 'Sân ABC',
        address: '1 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.ACTIVE,
        slug: 'old-slug',
      }),
    );

    await request(app.getHttpServer())
      .patch(`/venues/mine/${venue.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'new-slug' })
      .expect(200);

    await request(app.getHttpServer()).get('/venues/by-slug/old-slug').expect(404);
    const bySlug = await request(app.getHttpServer())
      .get('/venues/by-slug/new-slug')
      .expect(200);
    expect(bySlug.body.id).toBe(venue.id);
  });

  it('hiding a venue 404s the public single-venue lookup even though it is active', async () => {
    const { ownerId, token } = await ownerAndToken();
    const venuesRepo = dataSource.getRepository(Venue);
    const venue = await venuesRepo.save(
      venuesRepo.create({
        ownerId,
        name: 'Sân ABC',
        address: '1 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.ACTIVE,
        slug: 'abc-pickleball',
      }),
    );

    await request(app.getHttpServer())
      .patch(`/venues/mine/${venue.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ isHidden: true })
      .expect(200);

    await request(app.getHttpServer()).get(`/venues/${venue.id}`).expect(404);
  });

  it('rejects the 4th slug change within a 180-day window with 400', async () => {
    const { ownerId, token } = await ownerAndToken();
    const venuesRepo = dataSource.getRepository(Venue);
    const venue = await venuesRepo.save(
      venuesRepo.create({
        ownerId,
        name: 'Sân ABC',
        address: '1 Le Loi',
        city: 'Ho Chi Minh',
        status: VenueStatus.ACTIVE,
        slug: 'slug-0',
      }),
    );
    const historyRepo = dataSource.getRepository(VenueSlugHistory);
    const now = new Date();
    const daysAgo = [90, 120, 150];
    for (let i = 0; i < daysAgo.length; i++) {
      const changedAt = new Date(now);
      changedAt.setDate(changedAt.getDate() - daysAgo[i]);
      await historyRepo.save(
        historyRepo.create({ venueId: venue.id, oldSlug: `slug-${i}`, changedAt }),
      );
    }

    const response = await request(app.getHttpServer())
      .patch(`/venues/mine/${venue.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ slug: 'slug-final' })
      .expect(400);

    expect(response.body.message).toContain('giới hạn đổi đường dẫn');
  });

  it('blocks deletion with 409 when the venue has booking history, allows it otherwise', async () => {
    const { ownerId, token } = await ownerAndToken();
    const venueWithBooking = await createVenue(dataSource, ownerId, 'Có booking');
    const court = await createCourt(dataSource, venueWithBooking.id, 'San 1');
    const contact = await createContact(dataSource, ownerId, 'Khach A', '0900000001');
    await createBooking(dataSource, court.id, { customerContactId: contact.id });
    const venueWithoutBooking = await createVenue(dataSource, ownerId, 'Khong booking');

    await request(app.getHttpServer())
      .delete(`/venues/mine/${venueWithBooking.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(409);

    await request(app.getHttpServer())
      .delete(`/venues/mine/${venueWithoutBooking.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    await request(app.getHttpServer())
      .get(`/venues/mine/${venueWithoutBooking.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
  });

  it('set-default swaps which venue is default', async () => {
    const { ownerId, token } = await ownerAndToken();
    const first = await createVenue(dataSource, ownerId, 'Venue A');
    const venuesRepo = dataSource.getRepository(Venue);
    await venuesRepo.update(first.id, { isDefault: true });
    const second = await createVenue(dataSource, ownerId, 'Venue B');

    await request(app.getHttpServer())
      .post(`/venues/mine/${second.id}/set-default`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    const list = await request(app.getHttpServer())
      .get('/venues/mine')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    const byId = new Map(list.body.map((v: { id: string; isDefault: boolean }) => [v.id, v.isDefault]));
    expect(byId.get(first.id)).toBe(false);
    expect(byId.get(second.id)).toBe(true);
  });
});
