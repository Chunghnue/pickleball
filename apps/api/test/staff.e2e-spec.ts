import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { createUser, createStaff, loginAs, loginByPhone } from './utils/owner-fixtures';
import { UserRole, StaffRole } from '../src/users/entities/user.entity';

describe('Staff (e2e)', () => {
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

  it('lets an owner create a staff account, list it, and log in as that staff', async () => {
    const owner = await createUser(dataSource, 'staffowner1@test.com', UserRole.OWNER);
    const ownerToken = await loginAs(app, 'staffowner1@test.com');

    const createResponse = await request(app.getHttpServer())
      .post('/staff')
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({
        fullName: 'Thu ngân A',
        phone: '0911000088',
        staffRole: 'cashier',
        password: 'password123',
      })
      .expect(201);
    expect(createResponse.body).toMatchObject({
      fullName: 'Thu ngân A',
      role: 'staff',
      staffRole: 'cashier',
    });

    const listResponse = await request(app.getHttpServer())
      .get('/staff')
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);
    expect(listResponse.body).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: owner.id, role: 'owner' }),
        expect.objectContaining({ fullName: 'Thu ngân A', role: 'staff' }),
      ]),
    );

    const staffToken = await loginByPhone(app, '0911000088');
    expect(staffToken).toBeDefined();
  });

  it('rejects duplicate phone across owners', async () => {
    const owner1 = await createUser(dataSource, 'staffowner2@test.com', UserRole.OWNER);
    const owner1Token = await loginAs(app, 'staffowner2@test.com');
    await createStaff(dataSource, owner1.id, 'Existing', '0911000077', StaffRole.STAFF);

    await request(app.getHttpServer())
      .post('/staff')
      .set('Authorization', `Bearer ${owner1Token}`)
      .send({
        fullName: 'Trùng SĐT',
        phone: '0911000077',
        staffRole: 'manager',
        password: 'password1',
      })
      .expect(409);
  });

  it('rejects a cashier calling POST /staff (operational tier has no access)', async () => {
    const owner = await createUser(dataSource, 'staffowner3@test.com', UserRole.OWNER);
    const cashier = await createStaff(dataSource, owner.id, 'Cashier', '0911000066', StaffRole.CASHIER);
    const cashierToken = await loginByPhone(app, '0911000066');
    void cashier;

    await request(app.getHttpServer())
      .post('/staff')
      .set('Authorization', `Bearer ${cashierToken}`)
      .send({ fullName: 'X', phone: '0911000055', staffRole: 'staff', password: 'password1' })
      .expect(403);
  });

  it('updates, deactivates, and resets the password of an owned staff account', async () => {
    const owner = await createUser(dataSource, 'staffowner4@test.com', UserRole.OWNER);
    const ownerToken = await loginAs(app, 'staffowner4@test.com');
    const staff = await createStaff(dataSource, owner.id, 'Old Name', '0911000044', StaffRole.STAFF);

    await request(app.getHttpServer())
      .patch(`/staff/${staff.id}`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ fullName: 'New Name' })
      .expect(200)
      .expect((res) => expect(res.body.fullName).toBe('New Name'));

    await request(app.getHttpServer())
      .post(`/staff/${staff.id}/reset-password`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .send({ newPassword: 'brandnew1' })
      .expect(201);
    const relogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: '0911000044', password: 'brandnew1' })
      .expect(201);
    expect(relogin.body.accessToken).toBeDefined();

    await request(app.getHttpServer())
      .post(`/staff/${staff.id}/deactivate`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(201);
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ identifier: '0911000044', password: 'brandnew1' })
      .expect(403);
  });

  it("404s when acting on another owner's staff", async () => {
    const owner1 = await createUser(dataSource, 'staffowner5@test.com', UserRole.OWNER);
    await createUser(dataSource, 'staffowner6@test.com', UserRole.OWNER);
    const owner2Token = await loginAs(app, 'staffowner6@test.com');
    const staffOfOwner1 = await createStaff(dataSource, owner1.id, 'A', '0911000033', StaffRole.STAFF);

    await request(app.getHttpServer())
      .patch(`/staff/${staffOfOwner1.id}`)
      .set('Authorization', `Bearer ${owner2Token}`)
      .send({ fullName: 'Hijacked' })
      .expect(404);
  });

  it('rejects a manager from staff endpoints (owner-only tier, not full)', async () => {
    const owner = await createUser(dataSource, 'staffowner7@test.com', UserRole.OWNER);
    await createStaff(dataSource, owner.id, 'Manager', '0911000022', StaffRole.MANAGER);
    const managerToken = await loginByPhone(app, '0911000022');

    await request(app.getHttpServer())
      .get('/staff')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(403);
  });
});
