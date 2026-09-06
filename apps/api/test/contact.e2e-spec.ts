import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';

describe('Contact e2e', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await clearDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /contact/support-messages', () => {
    it('creates a support message', async () => {
      const response = await request(app.getHttpServer())
        .post('/contact/support-messages')
        .send({
          fullName: 'Nguyễn Văn A',
          phone: '0901234567',
          email: 'a@example.com',
          message: 'Tôi cần hỗ trợ đặt sân',
        })
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.fullName).toBe('Nguyễn Văn A');
    });

    it('allows omitting the optional email', async () => {
      await request(app.getHttpServer())
        .post('/contact/support-messages')
        .send({ fullName: 'Trần B', phone: '0912345678', message: 'Hỏi giá' })
        .expect(201);
    });

    it('rejects a missing fullName with 400', async () => {
      await request(app.getHttpServer())
        .post('/contact/support-messages')
        .send({ phone: '0912345678', message: 'Hỏi giá' })
        .expect(400);
    });

    it('rejects an unknown field with 400', async () => {
      await request(app.getHttpServer())
        .post('/contact/support-messages')
        .send({
          fullName: 'Trần B',
          phone: '0912345678',
          message: 'Hỏi giá',
          extra: 'not allowed',
        })
        .expect(400);
    });
  });

  describe('POST /contact/partner-applications', () => {
    const validPayload = {
      ownerFullName: 'Lê Văn C',
      ownerPhone: '0987654321',
      ownerEmail: 'owner@example.com',
      venueName: 'Sân Pickleball ABC',
      address: '123 Đường XYZ',
      province: 'Thành phố Hà Nội',
      ward: 'Phường Ba Đình',
      sportTypes: ['pickleball', 'cau-long'],
      courtCount: 4,
    };

    it('creates a partner application', async () => {
      const response = await request(app.getHttpServer())
        .post('/contact/partner-applications')
        .send(validPayload)
        .expect(201);

      expect(response.body.id).toBeDefined();
      expect(response.body.sportTypes).toEqual(['pickleball', 'cau-long']);
    });

    it('allows omitting the optional ward, website, and note', async () => {
      const { ward, ...withoutWard } = validPayload;
      await request(app.getHttpServer())
        .post('/contact/partner-applications')
        .send(withoutWard)
        .expect(201);
    });

    it('rejects an invalid sport type with 400', async () => {
      await request(app.getHttpServer())
        .post('/contact/partner-applications')
        .send({ ...validPayload, sportTypes: ['bong-chuyen'] })
        .expect(400);
    });

    it('rejects a missing courtCount with 400', async () => {
      const { courtCount, ...withoutCourtCount } = validPayload;
      await request(app.getHttpServer())
        .post('/contact/partner-applications')
        .send(withoutCourtCount)
        .expect(400);
    });

    it('rejects an empty sportTypes array with 400', async () => {
      await request(app.getHttpServer())
        .post('/contact/partner-applications')
        .send({ ...validPayload, sportTypes: [] })
        .expect(400);
    });
  });
});
