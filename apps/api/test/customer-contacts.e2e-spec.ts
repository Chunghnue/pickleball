import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { createUser, loginAs } from './utils/owner-fixtures';
import { UserRole } from '../src/users/entities/user.entity';

describe('POST /customer-contacts (e2e)', () => {
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

  it('rejects unauthenticated access with 401', async () => {
    await request(app.getHttpServer()).post('/customer-contacts').send({}).expect(401);
  });

  it('rejects a non-owner with 403', async () => {
    await createUser(dataSource, 'cust@test.com', UserRole.CUSTOMER);
    const token = await loginAs(app, 'cust@test.com');
    await request(app.getHttpServer())
      .post('/customer-contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'A', phone: '0900000001' })
      .expect(403);
  });

  it('creates a walk-in contact and returns 201', async () => {
    await createUser(dataSource, 'owner@test.com', UserRole.OWNER);
    const token = await loginAs(app, 'owner@test.com');
    const res = await request(app.getHttpServer())
      .post('/customer-contacts')
      .set('Authorization', `Bearer ${token}`)
      .send({ fullName: 'Nguyễn Văn A', phone: '0900000002', note: 'Thích sân 1' })
      .expect(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.fullName).toBe('Nguyễn Văn A');
    expect(res.body.phone).toBe('0900000002');
  });

  it('rejects a duplicate phone for the same owner with 409', async () => {
    await createUser(dataSource, 'owner@test.com', UserRole.OWNER);
    const token = await loginAs(app, 'owner@test.com');
    const payload = { fullName: 'A', phone: '0900000003' };
    await request(app.getHttpServer())
      .post('/customer-contacts')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(201);
    await request(app.getHttpServer())
      .post('/customer-contacts')
      .set('Authorization', `Bearer ${token}`)
      .send(payload)
      .expect(409);
  });
});
