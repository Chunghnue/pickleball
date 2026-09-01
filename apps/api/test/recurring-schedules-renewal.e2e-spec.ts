import { INestApplication } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { createTestApp, clearDatabase } from './utils/test-app';
import { User, UserRole, UserStatus } from '../src/users/entities/user.entity';
import { Venue, VenueStatus } from '../src/courts/entities/venue.entity';
import { Court, CourtStatus } from '../src/courts/entities/court.entity';
import { RecurringSchedulesService } from '../src/recurring-schedules/recurring-schedules.service';
import { RecurringSchedule } from '../src/recurring-schedules/entities/recurring-schedule.entity';

describe('Recurring schedule auto-renewal (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let recurringSchedulesService: RecurringSchedulesService;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    recurringSchedulesService = app.get(RecurringSchedulesService);
  });

  beforeEach(async () => {
    await clearDatabase(app);
  });

  afterAll(async () => {
    await app.close();
  });

  it('generates occurrences for the next 30 days and extends validTo', async () => {
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
      .send({ email: 'owner@test.com', password: 'password123' });
    const token = loginResponse.body.accessToken as string;

    const venuesRepo = dataSource.getRepository(Venue);
    const venue = await venuesRepo.save(
      venuesRepo.create({
        ownerId: owner.id,
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

    const createResponse = await request(app.getHttpServer())
      .post(`/venues/mine/${venue.id}/recurring-schedules`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        courtId: court.id,
        dayOfWeek: 0, // Monday
        startTime: '18:00',
        endTime: '19:00',
        pricePerSession: 100000,
        validFrom: '2098-12-01',
        validTo: '2099-01-05', // a Monday
        newCustomer: { fullName: 'Khách quen', phone: '0933333333' },
        autoRenew: true,
      })
      .expect(201);
    const scheduleId = createResponse.body.schedule.id as string;

    const scheduleRepo = dataSource.getRepository(RecurringSchedule);
    const schedule = await scheduleRepo.findOneOrFail({ where: { id: scheduleId } });

    const result = await recurringSchedulesService.renewSchedule(schedule);

    expect(result.generatedCount).toBeGreaterThan(0);
    expect(result.conflictingDates).toEqual([]);

    const updated = await scheduleRepo.findOneOrFail({ where: { id: scheduleId } });
    expect(updated.validTo).toBe('2099-02-04');

    const detailResponse = await request(app.getHttpServer())
      .get(`/venues/mine/${venue.id}/recurring-schedules/${scheduleId}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    // 3 occurrences from the original create() + occurrences from renewSchedule()
    expect(detailResponse.body.occurrences.length).toBeGreaterThan(3);
  });
});
