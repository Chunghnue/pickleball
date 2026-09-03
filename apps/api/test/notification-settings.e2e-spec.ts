import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase, mockMailService } from './utils/test-app';
import { createUser, loginAs, createVenue, createCourt, createBooking, payBooking } from './utils/owner-fixtures';
import { UserRole } from '../src/users/entities/user.entity';
import { DailyReportScheduler } from '../src/notification-settings/daily-report.scheduler';

describe('Notification settings (e2e)', () => {
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

  async function ownerAndToken(email: string) {
    const owner = await createUser(dataSource, email, UserRole.OWNER);
    const token = await loginAs(app, email);
    return { ownerId: owner.id, token };
  }

  it('GET returns all-true defaults when never configured', async () => {
    const { token } = await ownerAndToken('ns-owner1@test.com');

    const response = await request(app.getHttpServer())
      .get('/notification-settings/mine')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      newBooking: true,
      cancellation: true,
      payment: true,
      dailyReport: true,
    });
  });

  it('PATCH updates only the given fields and GET reflects it', async () => {
    const { token } = await ownerAndToken('ns-owner2@test.com');

    await request(app.getHttpServer())
      .patch('/notification-settings/mine')
      .set('Authorization', `Bearer ${token}`)
      .send({ newBooking: false })
      .expect(200);

    const response = await request(app.getHttpServer())
      .get('/notification-settings/mine')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);

    expect(response.body).toEqual({
      newBooking: false,
      cancellation: true,
      payment: true,
      dailyReport: true,
    });
  });

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer()).get('/notification-settings/mine').expect(401);
  });

  it('DailyReportScheduler.sendDailyReports emails an owner with venues and dailyReport on', async () => {
    const { ownerId, token } = await ownerAndToken('ns-daily@test.com');
    const venue = await createVenue(dataSource, ownerId, 'Sân báo cáo ngày');
    const court = await createCourt(dataSource, venue.id, 'Sân 1');
    const customer = await createUser(dataSource, 'ns-daily-customer@test.com', UserRole.CUSTOMER);
    const booking = await createBooking(dataSource, court.id, {
      customerId: customer.id,
      date: new Date().toISOString().slice(0, 10),
      totalPrice: 200000,
    });
    await payBooking(dataSource, booking.id);
    await request(app.getHttpServer())
      .patch('/notification-settings/mine')
      .set('Authorization', `Bearer ${token}`)
      .send({ dailyReport: true })
      .expect(200);

    const scheduler = app.get(DailyReportScheduler);
    await scheduler.sendDailyReports();

    expect(mockMailService.send).toHaveBeenCalledWith(
      'ns-daily@test.com',
      'Báo cáo ngày',
      expect.any(String),
    );
  });
});
