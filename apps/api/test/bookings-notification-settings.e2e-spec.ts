import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import {
  createTestApp,
  clearDatabase,
  mockMailService,
} from './utils/test-app';
import {
  createUser,
  loginAs,
  createVenue,
  createCourt,
} from './utils/owner-fixtures';
import { UserRole } from '../src/users/entities/user.entity';

describe('Bookings owner-notification gating (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
  });

  beforeEach(async () => {
    await clearDatabase(app);
    mockMailService.send.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('does not email the owner on cancellation when the setting is off, but does email the customer', async () => {
    const owner = await createUser(
      dataSource,
      'bookingsowner-notif@test.com',
      UserRole.OWNER,
    );
    const venue = await createVenue(dataSource, owner.id, 'Venue A');
    const court = await createCourt(dataSource, venue.id, 'Sân 1');
    await createUser(
      dataSource,
      'bookingscustomer-notif@test.com',
      UserRole.CUSTOMER,
    );
    const ownerToken = await loginAs(app, 'bookingsowner-notif@test.com');
    const customerToken = await loginAs(app, 'bookingscustomer-notif@test.com');

    await request(app.getHttpServer())
      .patch('/notification-settings/mine')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ cancellation: false })
      .expect(200);

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        courtId: court.id,
        date: '2099-05-01',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
      })
      .expect(201);

    mockMailService.send.mockClear();

    await request(app.getHttpServer())
      .post(`/bookings/${createResponse.body.id}/cancel`)
      .set('Authorization', `Bearer ${customerToken}`)
      .expect(201);

    expect(mockMailService.send).toHaveBeenCalledWith(
      'bookingscustomer-notif@test.com',
      'Booking đã được huỷ',
      expect.any(String),
    );
    expect(mockMailService.send).not.toHaveBeenCalledWith(
      'bookingsowner-notif@test.com',
      'Khách hàng đã huỷ booking',
      expect.any(String),
    );
  });

  it('does not email the owner on a new booking when the setting is off, but does email the customer', async () => {
    const owner = await createUser(
      dataSource,
      'bookingsowner-notif2@test.com',
      UserRole.OWNER,
    );
    const venue = await createVenue(dataSource, owner.id, 'Venue A');
    const court = await createCourt(dataSource, venue.id, 'Sân 1');
    await createUser(
      dataSource,
      'bookingscustomer-notif2@test.com',
      UserRole.CUSTOMER,
    );
    const ownerToken = await loginAs(app, 'bookingsowner-notif2@test.com');
    const customerToken = await loginAs(
      app,
      'bookingscustomer-notif2@test.com',
    );

    await request(app.getHttpServer())
      .patch('/notification-settings/mine')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ newBooking: false })
      .expect(200);

    mockMailService.send.mockClear();

    await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        courtId: court.id,
        date: '2099-05-02',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
      })
      .expect(201);

    expect(mockMailService.send).toHaveBeenCalledWith(
      'bookingscustomer-notif2@test.com',
      'Xác nhận đặt sân',
      expect.any(String),
    );
    expect(mockMailService.send).not.toHaveBeenCalledWith(
      'bookingsowner-notif2@test.com',
      'Có booking mới',
      expect.any(String),
    );
  });
});
