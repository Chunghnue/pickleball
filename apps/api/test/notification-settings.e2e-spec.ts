import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { createUser, loginAs } from './utils/owner-fixtures';
import { UserRole } from '../src/users/entities/user.entity';

describe('Notification settings (e2e)', () => {
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
});
