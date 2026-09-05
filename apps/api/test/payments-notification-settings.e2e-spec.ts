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

describe('Payments owner-notification gating (e2e)', () => {
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

  it('emails the owner on mark-paid when the setting is on', async () => {
    const owner = await createUser(
      dataSource,
      'payowner-notif@test.com',
      UserRole.OWNER,
    );
    const venue = await createVenue(dataSource, owner.id, 'Venue A');
    const court = await createCourt(dataSource, venue.id, 'Sân 1');
    await createUser(
      dataSource,
      'paycustomer-notif@test.com',
      UserRole.CUSTOMER,
    );
    const ownerToken = await loginAs(app, 'payowner-notif@test.com');
    const customerToken = await loginAs(app, 'paycustomer-notif@test.com');

    const createResponse = await request(app.getHttpServer())
      .post('/bookings')
      .set('Authorization', `Bearer ${customerToken}`)
      .send({
        courtId: court.id,
        date: '2099-06-01',
        startTime: '08:00',
        endTime: '09:00',
        contactName: 'Nguyễn Văn A',
        contactPhone: '0900000000',
      })
      .expect(201);

    mockMailService.send.mockClear();

    await request(app.getHttpServer())
      .post(
        `/venues/mine/${venue.id}/bookings/${createResponse.body.id}/payment/mark-paid`,
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ note: 'Tiền mặt' })
      .expect(201);

    expect(mockMailService.send).toHaveBeenCalledWith(
      'payowner-notif@test.com',
      'Đã nhận thanh toán',
      expect.any(String),
    );
  });
});
