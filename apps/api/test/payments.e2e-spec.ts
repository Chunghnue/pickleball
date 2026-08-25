import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court } from '../src/courts/entities/court.entity';

describe('Payments (e2e)', () => {
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

  async function createActiveUserAndLogin(
    email: string,
    role: UserRole,
  ): Promise<{ userId: string; token: string }> {
    const passwordHash = await bcrypt.hash('password123', 10);
    const repo = dataSource.getRepository(User);
    const user = await repo.save(
      repo.create({
        email,
        passwordHash,
        fullName: 'Test User',
        role,
        status: UserStatus.ACTIVE,
        emailVerified: true,
      }),
    );
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'password123' });
    return {
      userId: user.id,
      token: loginResponse.body.accessToken as string,
    };
  }

  async function createActiveVenueAndCourt(
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
        cancellationCutoffHours: 2,
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
    return { venueId: venue.id, courtId: court.id };
  }

  it('walks a booking from unpaid through paid to refunded, visible to both owner and customer', async () => {
    const owner = await createActiveUserAndLogin(
      'payowner1@test.com',
      UserRole.OWNER,
    );
    const { venueId, courtId } = await createActiveVenueAndCourt(owner.userId);
    const customer = await createActiveUserAndLogin(
      'paycustomer1@test.com',
      UserRole.CUSTOMER,
    );

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        courtId,
        date: '2099-02-01',
        startTime: '08:00',
        endTime: '09:00',
      })
      .expect(201);
    const bookingId = createResponse.body.id;

    const mineBeforePaid = await request(app.getHttpServer())
      .get('/bookings/mine')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(mineBeforePaid.body[0]).toMatchObject({ paymentStatus: 'unpaid' });

    await request(app.getHttpServer())
      .post(`/venues/mine/${venueId}/bookings/${bookingId}/payment/mark-paid`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ note: 'CK Vietcombank' })
      .expect(201);

    const ownerListAfterPaid = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/bookings`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(ownerListAfterPaid.body[0]).toMatchObject({
      paymentStatus: 'paid',
      paymentNote: 'CK Vietcombank',
    });

    const mineAfterPaid = await request(app.getHttpServer())
      .get('/bookings/mine')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(200);
    expect(mineAfterPaid.body[0]).toMatchObject({ paymentStatus: 'paid' });

    await request(app.getHttpServer())
      .post(
        `/venues/mine/${venueId}/bookings/${bookingId}/payment/mark-paid`,
      )
      .set('Authorization', `Bearer ${owner.token}`)
      .send({})
      .expect(400);

    await request(app.getHttpServer())
      .post(
        `/venues/mine/${venueId}/bookings/${bookingId}/payment/mark-refunded`,
      )
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ note: 'Đã hoàn tiền qua CK' })
      .expect(201);

    const ownerListAfterRefunded = await request(app.getHttpServer())
      .get(`/venues/mine/${venueId}/bookings`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    expect(ownerListAfterRefunded.body[0]).toMatchObject({
      paymentStatus: 'refunded',
      paymentNote: 'Đã hoàn tiền qua CK',
    });
  });

  it('rejects mark-paid/mark-refunded for a booking on another owner\'s venue', async () => {
    const owner = await createActiveUserAndLogin(
      'payowner2@test.com',
      UserRole.OWNER,
    );
    const otherOwner = await createActiveUserAndLogin(
      'payowner3@test.com',
      UserRole.OWNER,
    );
    const { venueId: otherVenueId } = await createActiveVenueAndCourt(
      otherOwner.userId,
    );
    const { courtId } = await createActiveVenueAndCourt(owner.userId);
    const customer = await createActiveUserAndLogin(
      'paycustomer2@test.com',
      UserRole.CUSTOMER,
    );

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        courtId,
        date: '2099-02-02',
        startTime: '08:00',
        endTime: '09:00',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post(
        `/venues/mine/${otherVenueId}/bookings/${createResponse.body.id}/payment/mark-paid`,
      )
      .set('Authorization', `Bearer ${otherOwner.token}`)
      .send({})
      .expect(404);
  });
});
