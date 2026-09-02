import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court, CourtStatus } from '../src/courts/entities/court.entity';

describe('Pricing rules (e2e)', () => {
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

  async function createOwnerAndLogin(): Promise<{ ownerId: string; token: string }> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const usersRepo = dataSource.getRepository(User);
    const owner = await usersRepo.save(
      usersRepo.create({
        email: 'owner@test.com',
        passwordHash,
        fullName: 'Owner',
        role: UserRole.OWNER,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: 'owner@test.com', password: 'password123' });
    return { ownerId: owner.id, token: loginResponse.body.accessToken as string };
  }

  async function createVenueAndCourt(
    ownerId: string,
  ): Promise<{ venueId: string; courtId: string }> {
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
        closeTime: '23:00',
        slotDurationMinutes: 60,
        status: CourtStatus.ACTIVE,
      }),
    );
    return { venueId: venue.id, courtId: court.id };
  }

  it('creates, lists, updates and deletes a pricing rule', async () => {
    const { ownerId, token } = await createOwnerAndLogin();
    const { venueId, courtId } = await createVenueAndCourt(ownerId);

    const createResponse = await request(app.getHttpServer())
      .post(`/venues/mine/${venueId}/courts/${courtId}/pricing-rules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Buổi tối',
        daysOfWeek: [0, 1, 2, 3, 4],
        startTime: '17:00',
        endTime: '22:00',
        price: 150000,
      })
      .expect(201);
    const ruleId = createResponse.body.id as string;

    const listResponse = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/courts/${courtId}/pricing-rules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(listResponse.body).toHaveLength(1);

    await request(app.getHttpServer())
      .patch(`/venues/mine/${venueId}/courts/${courtId}/pricing-rules/${ruleId}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ price: 180000 })
      .expect(200)
      .expect((res) => {
        if (res.body.price !== 180000) {
          throw new Error(`Expected updated price 180000, got ${res.body.price}`);
        }
      });

    await request(app.getHttpServer())
      .delete(`/venues/mine/${venueId}/courts/${courtId}/pricing-rules/${ruleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    const afterDelete = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/courts/${courtId}/pricing-rules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(afterDelete.body).toHaveLength(0);
  });

  it('copies rules from a court the owner owns in a different venue', async () => {
    const { ownerId, token } = await createOwnerAndLogin();
    const { venueId: sourceVenueId, courtId: sourceCourtId } = await createVenueAndCourt(ownerId);
    const { venueId: targetVenueId, courtId: targetCourtId } = await createVenueAndCourt(ownerId);

    await request(app.getHttpServer())
      .post(`/venues/mine/${sourceVenueId}/courts/${sourceCourtId}/pricing-rules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Buổi tối',
        daysOfWeek: [0, 1, 2, 3, 4],
        startTime: '17:00',
        endTime: '22:00',
        price: 150000,
      })
      .expect(201);

    const copyResponse = await request(app.getHttpServer())
      .post(
        `/venues/mine/${targetVenueId}/courts/${targetCourtId}/pricing-rules/copy-from/${sourceCourtId}`,
      )
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(copyResponse.body).toHaveLength(1);
    expect(copyResponse.body[0].name).toBe('Buổi tối');

    const targetCourtRules = await request(app.getHttpServer())
      .get(`/venues/mine/${targetVenueId}/courts/${targetCourtId}/pricing-rules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(targetCourtRules.body).toHaveLength(1);
  });

  it('copies every source-venue rule onto every court of the target venue', async () => {
    const { ownerId, token } = await createOwnerAndLogin();
    const { venueId: sourceVenueId, courtId: sourceCourtId } = await createVenueAndCourt(ownerId);
    const { venueId: targetVenueId, courtId: targetCourtId1 } = await createVenueAndCourt(ownerId);
    const courtsRepo = dataSource.getRepository(Court);
    const targetCourt2 = await courtsRepo.save(
      courtsRepo.create({
        venueId: targetVenueId,
        name: 'Sân 2',
        pricePerHour: 100000,
        openTime: '08:00',
        closeTime: '23:00',
        slotDurationMinutes: 60,
        status: CourtStatus.ACTIVE,
      }),
    );

    await request(app.getHttpServer())
      .post(`/venues/mine/${sourceVenueId}/courts/${sourceCourtId}/pricing-rules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Buổi tối',
        daysOfWeek: [0, 1, 2, 3, 4],
        startTime: '17:00',
        endTime: '22:00',
        price: 150000,
      })
      .expect(201);

    const copyResponse = await request(app.getHttpServer())
      .post(`/venues/mine/${targetVenueId}/pricing-rules/copy-from-venue/${sourceVenueId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    // 1 source rule x 2 target courts
    expect(copyResponse.body).toHaveLength(2);
    expect(copyResponse.body.map((r: { courtId: string }) => r.courtId).sort()).toEqual(
      [targetCourtId1, targetCourt2.id].sort(),
    );

    const court1Rules = await request(app.getHttpServer())
      .get(`/venues/mine/${targetVenueId}/courts/${targetCourtId1}/pricing-rules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(court1Rules.body).toHaveLength(1);
    expect(court1Rules.body[0].name).toBe('Buổi tối');

    const court2Rules = await request(app.getHttpServer())
      .get(`/venues/mine/${targetVenueId}/courts/${targetCourt2.id}/pricing-rules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(court2Rules.body).toHaveLength(1);
  });

  it('rejects a pricing rule request for a venue owned by someone else', async () => {
    const { token } = await createOwnerAndLogin();
    const otherOwnerId = (await createOwnerAndLoginAsSecondOwner()).ownerId;
    const { venueId, courtId } = await createVenueAndCourt(otherOwnerId);

    await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/courts/${courtId}/pricing-rules`)
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  async function createOwnerAndLoginAsSecondOwner(): Promise<{ ownerId: string; token: string }> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const usersRepo = dataSource.getRepository(User);
    const owner = await usersRepo.save(
      usersRepo.create({
        email: 'owner2@test.com',
        passwordHash,
        fullName: 'Owner 2',
        role: UserRole.OWNER,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: 'owner2@test.com', password: 'password123' });
    return { ownerId: owner.id, token: loginResponse.body.accessToken as string };
  }
});
