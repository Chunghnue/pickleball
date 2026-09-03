import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { createUser, loginAs, createVenue } from './utils/owner-fixtures';
import { UserRole } from '../src/users/entities/user.entity';

describe('Venue operating hours (e2e)', () => {
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

  async function ownerVenueAndToken() {
    const owner = await createUser(dataSource, 'oh-owner@test.com', UserRole.OWNER);
    const venue = await createVenue(dataSource, owner.id, 'Sân giờ hoạt động');
    const token = await loginAs(app, 'oh-owner@test.com');
    return { ownerId: owner.id, venueId: venue.id, token };
  }

  function sevenDays() {
    return [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      isOpen: dayOfWeek !== 0,
      openTime: dayOfWeek !== 0 ? '07:00' : undefined,
      closeTime: dayOfWeek !== 0 ? '21:00' : undefined,
    }));
  }

  it('GET returns the default schedule before anything is saved', async () => {
    const { venueId, token } = await ownerVenueAndToken();

    const response = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/operating-hours`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toHaveLength(7);
    expect(response.body[0]).toMatchObject({ isOpen: true, openTime: '06:00', closeTime: '22:00' });
  });

  it('PUT saves the 7-day schedule and GET reflects it', async () => {
    const { venueId, token } = await ownerVenueAndToken();

    await request(app.getHttpServer())
      .put(`/venues/mine/${venueId}/operating-hours`)
      .set('Authorization', `Bearer ${token}`)
      .send(sevenDays())
      .expect(200);

    const response = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/operating-hours`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const sunday = response.body.find((d: { dayOfWeek: number }) => d.dayOfWeek === 0);
    expect(sunday).toMatchObject({ isOpen: false, openTime: null, closeTime: null });
    const monday = response.body.find((d: { dayOfWeek: number }) => d.dayOfWeek === 1);
    expect(monday).toMatchObject({ isOpen: true, openTime: '07:00', closeTime: '21:00' });
  });

  it('PUT rejects a payload with fewer than 7 days', async () => {
    const { venueId, token } = await ownerVenueAndToken();

    await request(app.getHttpServer())
      .put(`/venues/mine/${venueId}/operating-hours`)
      .set('Authorization', `Bearer ${token}`)
      .send(sevenDays().slice(0, 6))
      .expect(400);
  });

  it('rejects a venue that does not belong to the caller', async () => {
    const { venueId } = await ownerVenueAndToken();
    const otherOwner = await createUser(dataSource, 'oh-other@test.com', UserRole.OWNER);
    const otherToken = await loginAs(app, 'oh-other@test.com');

    await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/operating-hours`)
      .set('Authorization', `Bearer ${otherToken}`)
      .expect(403);
  });
});
