import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { VenuesService } from './venues.service';
import { Venue, VenueStatus } from './entities/venue.entity';
import { VenueImage } from './entities/venue-image.entity';
import { VenueSlugHistory } from './entities/venue-slug-history.entity';
import { Court } from './entities/court.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Payment } from '../payments/entities/payment.entity';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

const mockVenuesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockVenueImagesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
  find: jest.fn(),
});

const mockSlugHistoryRepository = () => ({
  count: jest.fn(),
  findOne: jest.fn(),
});

const mockCourtsRepository = () => ({
  find: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockBookingsRepository = () => ({
  count: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockPaymentsRepository = () => ({
  createQueryBuilder: jest.fn(),
});

const mockUsersService = () => ({
  findById: jest.fn(),
});

const mockNotificationsService = () => ({
  notifyVenueApproved: jest.fn().mockResolvedValue(undefined),
  notifyVenueRejected: jest.fn().mockResolvedValue(undefined),
});

const mockDataSource = () => ({
  transaction: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      VenuesService,
      { provide: getRepositoryToken(Venue), useFactory: mockVenuesRepository },
      {
        provide: getRepositoryToken(VenueImage),
        useFactory: mockVenueImagesRepository,
      },
      {
        provide: getRepositoryToken(VenueSlugHistory),
        useFactory: mockSlugHistoryRepository,
      },
      { provide: getRepositoryToken(Court), useFactory: mockCourtsRepository },
      { provide: getRepositoryToken(Booking), useFactory: mockBookingsRepository },
      { provide: getRepositoryToken(Payment), useFactory: mockPaymentsRepository },
      { provide: UsersService, useFactory: mockUsersService },
      { provide: NotificationsService, useFactory: mockNotificationsService },
      { provide: DataSource, useFactory: mockDataSource },
    ],
  }).compile();

  return {
    service: module.get(VenuesService),
    venuesRepo: module.get(getRepositoryToken(Venue)) as ReturnType<
      typeof mockVenuesRepository
    >,
    venueImagesRepo: module.get(getRepositoryToken(VenueImage)) as ReturnType<
      typeof mockVenueImagesRepository
    >,
    slugHistoryRepo: module.get(getRepositoryToken(VenueSlugHistory)) as ReturnType<
      typeof mockSlugHistoryRepository
    >,
    courtsRepo: module.get(getRepositoryToken(Court)) as ReturnType<
      typeof mockCourtsRepository
    >,
    bookingsRepo: module.get(getRepositoryToken(Booking)) as ReturnType<
      typeof mockBookingsRepository
    >,
    paymentsRepo: module.get(getRepositoryToken(Payment)) as ReturnType<
      typeof mockPaymentsRepository
    >,
    usersService: module.get(UsersService) as ReturnType<
      typeof mockUsersService
    >,
    notificationsService: module.get(NotificationsService) as ReturnType<
      typeof mockNotificationsService
    >,
    dataSource: module.get(DataSource) as ReturnType<typeof mockDataSource>,
  };
}

function buildMockQueryBuilder<T>(result: T[]) {
  const qb: Record<string, jest.Mock> = {};
  qb.where = jest.fn().mockReturnValue(qb);
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.getMany = jest.fn().mockResolvedValue(result);
  return qb;
}

function buildMockRawQueryBuilder<T>(result: T[]) {
  const qb: Record<string, jest.Mock> = {};
  qb.select = jest.fn().mockReturnValue(qb);
  qb.addSelect = jest.fn().mockReturnValue(qb);
  qb.innerJoin = jest.fn().mockReturnValue(qb);
  qb.where = jest.fn().mockReturnValue(qb);
  qb.andWhere = jest.fn().mockReturnValue(qb);
  qb.groupBy = jest.fn().mockReturnValue(qb);
  qb.getRawMany = jest.fn().mockResolvedValue(result);
  return qb;
}

describe('VenuesService.create', () => {
  it('creates a venue with pending_approval status', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.create.mockImplementation((data) => data);
    venuesRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'venue-1', ...data }),
    );

    const result = await service.create('owner-1', {
      name: 'ABC Pickleball',
      address: '123 Le Loi',
      city: 'Ho Chi Minh',
    });

    expect(result.ownerId).toBe('owner-1');
    expect(result.status).toBe(VenueStatus.PENDING_APPROVAL);
  });
});

describe('VenuesService.create — isDefault', () => {
  it("sets isDefault true for the owner's first venue", async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);
    venuesRepo.create.mockImplementation((data) => data);
    venuesRepo.save.mockImplementation((data) => Promise.resolve({ id: 'venue-1', ...data }));

    const result = await service.create('owner-1', {
      name: 'ABC Pickleball',
      address: '123 Le Loi',
      city: 'Ho Chi Minh',
    });

    expect(result.isDefault).toBe(true);
  });

  it('sets isDefault false when the owner already has a venue', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(1);
    venuesRepo.create.mockImplementation((data) => data);
    venuesRepo.save.mockImplementation((data) => Promise.resolve({ id: 'venue-2', ...data }));

    const result = await service.create('owner-1', {
      name: 'XYZ Pickleball',
      address: '456 Le Loi',
      city: 'Ho Chi Minh',
    });

    expect(result.isDefault).toBe(false);
  });
});

describe('VenuesService.create — phone', () => {
  it('sets phone when provided, null otherwise', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);
    venuesRepo.findOne.mockResolvedValue(null);
    venuesRepo.create.mockImplementation((data) => data);
    venuesRepo.save.mockImplementation((data) => Promise.resolve({ id: 'venue-1', ...data }));

    const withPhone = await service.create('owner-1', {
      name: 'ABC Pickleball',
      address: '123 Le Loi',
      city: 'Ho Chi Minh',
      phone: '0901234567',
    });
    expect(withPhone.phone).toBe('0901234567');

    const withoutPhone = await service.create('owner-1', {
      name: 'XYZ Pickleball',
      address: '456 Le Loi',
      city: 'Ho Chi Minh',
    });
    expect(withoutPhone.phone).toBeNull();
  });
});

describe('VenuesService.create — slug', () => {
  it('generates a slug from the name when not provided', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);
    venuesRepo.findOne.mockResolvedValue(null);
    venuesRepo.create.mockImplementation((data) => data);
    venuesRepo.save.mockImplementation((data) => Promise.resolve({ id: 'venue-1', ...data }));

    const result = await service.create('owner-1', {
      name: 'Sân Đình Văn Chung',
      address: '123 Le Loi',
      city: 'Ho Chi Minh',
    });

    expect(result.slug).toBe('san-dinh-van-chung');
  });

  it('appends a random 4-digit suffix when the generated slug is taken', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);
    venuesRepo.findOne
      .mockResolvedValueOnce({ id: 'other-venue', slug: 'abc-pickleball' })
      .mockResolvedValueOnce(null);
    venuesRepo.create.mockImplementation((data) => data);
    venuesRepo.save.mockImplementation((data) => Promise.resolve({ id: 'venue-2', ...data }));

    const result = await service.create('owner-1', {
      name: 'ABC Pickleball',
      address: '123 Le Loi',
      city: 'Ho Chi Minh',
    });

    expect(result.slug).toMatch(/^abc-pickleball-\d{4}$/);
  });

  it('uses the requested slug when provided and available', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);
    venuesRepo.findOne.mockResolvedValue(null);
    venuesRepo.create.mockImplementation((data) => data);
    venuesRepo.save.mockImplementation((data) => Promise.resolve({ id: 'venue-1', ...data }));

    const result = await service.create('owner-1', {
      name: 'ABC Pickleball',
      address: '123 Le Loi',
      city: 'Ho Chi Minh',
      slug: 'my-custom-slug',
    });

    expect(result.slug).toBe('my-custom-slug');
  });

  it('throws ConflictException when the requested slug is already taken', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);
    venuesRepo.findOne.mockResolvedValue({ id: 'other-venue', slug: 'taken-slug' });

    await expect(
      service.create('owner-1', {
        name: 'ABC Pickleball',
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        slug: 'taken-slug',
      }),
    ).rejects.toThrow('Đường dẫn này đã được sử dụng');
  });

  it('sets district/latitude/longitude/email when provided, null otherwise', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);
    venuesRepo.findOne.mockResolvedValue(null);
    venuesRepo.create.mockImplementation((data) => data);
    venuesRepo.save.mockImplementation((data) => Promise.resolve({ id: 'venue-1', ...data }));

    const withFields = await service.create('owner-1', {
      name: 'ABC Pickleball',
      address: '123 Le Loi',
      city: 'Ho Chi Minh',
      district: 'Quan 1',
      latitude: 10.77,
      longitude: 106.7,
      email: 'branch@test.com',
    });
    expect(withFields.district).toBe('Quan 1');
    expect(withFields.latitude).toBe(10.77);
    expect(withFields.longitude).toBe(106.7);
    expect(withFields.email).toBe('branch@test.com');

    const withoutFields = await service.create('owner-1', {
      name: 'XYZ Pickleball',
      address: '456 Le Loi',
      city: 'Ho Chi Minh',
    });
    expect(withoutFields.district).toBeNull();
    expect(withoutFields.latitude).toBeNull();
    expect(withoutFields.longitude).toBeNull();
    expect(withoutFields.email).toBeNull();
  });
});

describe('VenuesService.update — phone', () => {
  it('sets phone when provided', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'venue-1', { phone: '0368886999' });

    expect(result.phone).toBe('0368886999');
  });
});

describe('VenuesService.getOwnedVenueOrThrow', () => {
  it('returns the venue when owned by the caller', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });

    const result = await service.getOwnedVenueOrThrow('owner-1', 'venue-1');

    expect(result.id).toBe('venue-1');
  });

  it('throws NotFoundException when the venue does not exist', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue(null);

    await expect(
      service.getOwnedVenueOrThrow('owner-1', 'venue-1'),
    ).rejects.toThrow('Venue venue-1 không tồn tại');
  });

  it('throws ForbiddenException when owned by someone else', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-2' });

    await expect(
      service.getOwnedVenueOrThrow('owner-1', 'venue-1'),
    ).rejects.toThrow('Bạn không có quyền truy cập venue này');
  });
});

describe('VenuesService.update', () => {
  it('updates only the provided fields', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      name: 'Old Name',
      address: 'Old Address',
      city: 'Old City',
      description: null,
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'venue-1', {
      name: 'New Name',
    });

    expect(result.name).toBe('New Name');
    expect(result.address).toBe('Old Address');
  });

  it('updates cancellationCutoffHours when provided', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      name: 'Old Name',
      address: 'Old Address',
      city: 'Old City',
      description: null,
      cancellationCutoffHours: 2,
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'venue-1', {
      cancellationCutoffHours: 4,
    });

    expect(result.cancellationCutoffHours).toBe(4);
  });

  it('updates the website field when provided', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      website: null,
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'venue-1', {
      website: 'https://example.com',
    });

    expect(result.website).toBe('https://example.com');
  });
});

describe('VenuesService.update — district/coordinates/email/isHidden', () => {
  it('sets district/latitude/longitude/email/isHidden when provided', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      slug: 'venue-1-slug',
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'venue-1', {
      district: 'Quan 1',
      latitude: 10.77,
      longitude: 106.7,
      email: 'branch@test.com',
      isHidden: true,
    });

    expect(result.district).toBe('Quan 1');
    expect(result.latitude).toBe(10.77);
    expect(result.longitude).toBe(106.7);
    expect(result.email).toBe('branch@test.com');
    expect(result.isHidden).toBe(true);
  });
});

describe('VenuesService.update — slug', () => {
  const FIXED_NOW = new Date('2026-09-02T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('changes the slug and records history when available and under the limit', async () => {
    const { service, venuesRepo, slugHistoryRepo, dataSource } = await buildTestingModule();
    venuesRepo.findOne
      .mockResolvedValueOnce({
        id: 'venue-1',
        ownerId: 'owner-1',
        slug: 'old-slug',
        updatedAt: new Date('2026-01-01T00:00:00Z'),
      })
      .mockResolvedValueOnce(null);
    slugHistoryRepo.count.mockResolvedValue(0);
    slugHistoryRepo.findOne.mockResolvedValue(null);
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));
    const manager = { insert: jest.fn().mockResolvedValue(undefined) };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.update('owner-1', 'venue-1', { slug: 'new-slug' });

    expect(result.slug).toBe('new-slug');
    expect(manager.insert).toHaveBeenCalledWith(VenueSlugHistory, {
      venueId: 'venue-1',
      oldSlug: 'old-slug',
    });
  });

  it('allows the first-ever slug change even if the venue itself was just updated', async () => {
    const { service, venuesRepo, slugHistoryRepo, dataSource } = await buildTestingModule();
    venuesRepo.findOne
      .mockResolvedValueOnce({
        id: 'venue-1',
        ownerId: 'owner-1',
        slug: 'old-slug',
        updatedAt: FIXED_NOW,
      })
      .mockResolvedValueOnce(null);
    slugHistoryRepo.count.mockResolvedValue(0);
    slugHistoryRepo.findOne.mockResolvedValue(null);
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));
    const manager = { insert: jest.fn().mockResolvedValue(undefined) };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.update('owner-1', 'venue-1', { slug: 'new-slug' });

    expect(result.slug).toBe('new-slug');
  });

  it('does nothing slug-related when the slug is unchanged', async () => {
    const { service, venuesRepo, slugHistoryRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      slug: 'same-slug',
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    await service.update('owner-1', 'venue-1', { slug: 'same-slug' });

    expect(slugHistoryRepo.count).not.toHaveBeenCalled();
  });

  it('throws ConflictException when the new slug is already used by another venue', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne
      .mockResolvedValueOnce({ id: 'venue-1', ownerId: 'owner-1', slug: 'old-slug' })
      .mockResolvedValueOnce({ id: 'venue-2', slug: 'taken-slug' });

    await expect(
      service.update('owner-1', 'venue-1', { slug: 'taken-slug' }),
    ).rejects.toThrow('Đường dẫn này đã được sử dụng');
  });

  it('throws BadRequestException at 3 changes already within the last 180 days', async () => {
    const { service, venuesRepo, slugHistoryRepo } = await buildTestingModule();
    venuesRepo.findOne
      .mockResolvedValueOnce({ id: 'venue-1', ownerId: 'owner-1', slug: 'old-slug' })
      .mockResolvedValueOnce(null);
    slugHistoryRepo.count.mockResolvedValue(3);

    await expect(
      service.update('owner-1', 'venue-1', { slug: 'new-slug' }),
    ).rejects.toThrow('Đã đạt giới hạn đổi đường dẫn (3 lần/180 ngày)');
  });

  it('throws BadRequestException when the last change was under 60 days ago', async () => {
    const { service, venuesRepo, slugHistoryRepo } = await buildTestingModule();
    venuesRepo.findOne
      .mockResolvedValueOnce({ id: 'venue-1', ownerId: 'owner-1', slug: 'old-slug' })
      .mockResolvedValueOnce(null);
    slugHistoryRepo.count.mockResolvedValue(1);
    slugHistoryRepo.findOne.mockResolvedValue({
      changedAt: new Date('2026-08-20T00:00:00Z'),
    });

    await expect(
      service.update('owner-1', 'venue-1', { slug: 'new-slug' }),
    ).rejects.toThrow('Cần đợi đủ 60 ngày kể từ lần đổi trước');
  });
});

describe('VenuesService.setDefault', () => {
  it('unsets every other venue of the owner and sets the target as default', async () => {
    const { service, venuesRepo, dataSource } = await buildTestingModule();
    venuesRepo.findOne
      .mockResolvedValueOnce({ id: 'venue-2', ownerId: 'owner-1', isDefault: false })
      .mockResolvedValueOnce({ id: 'venue-2', ownerId: 'owner-1', isDefault: true });
    const manager = { update: jest.fn().mockResolvedValue(undefined) };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.setDefault('owner-1', 'venue-2');

    expect(manager.update).toHaveBeenCalledWith(
      Venue,
      { ownerId: 'owner-1' },
      { isDefault: false },
    );
    expect(manager.update).toHaveBeenCalledWith(Venue, { id: 'venue-2' }, { isDefault: true });
    expect(result.isDefault).toBe(true);
  });

  it('throws NotFoundException for a venue not owned by the caller', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue(null);

    await expect(service.setDefault('owner-1', 'venue-2')).rejects.toThrow(
      'Venue venue-2 không tồn tại',
    );
  });
});

describe('VenuesService.remove', () => {
  it('throws ConflictException when any court in the venue has booking history', async () => {
    const { service, venuesRepo, courtsRepo, bookingsRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1', isDefault: false });
    courtsRepo.find.mockResolvedValue([{ id: 'court-1', venueId: 'venue-1' }]);
    bookingsRepo.count.mockResolvedValue(1);

    await expect(service.remove('owner-1', 'venue-1')).rejects.toThrow(
      'Chi nhánh đã có lịch sử đặt sân',
    );
  });

  it('deletes the venue and its courts when there is no booking history', async () => {
    const { service, venuesRepo, courtsRepo, bookingsRepo, dataSource } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1', isDefault: false });
    courtsRepo.find.mockResolvedValue([{ id: 'court-1', venueId: 'venue-1' }]);
    bookingsRepo.count.mockResolvedValue(0);
    const manager = { delete: jest.fn().mockResolvedValue(undefined) };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    await service.remove('owner-1', 'venue-1');

    expect(manager.delete).toHaveBeenCalledWith(Venue, { id: 'venue-1' });
  });

  it('promotes the oldest remaining venue to default when the deleted venue was default', async () => {
    const { service, venuesRepo, courtsRepo, bookingsRepo, dataSource } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1', isDefault: true });
    courtsRepo.find.mockResolvedValue([]);
    bookingsRepo.count.mockResolvedValue(0);
    const manager = { delete: jest.fn().mockResolvedValue(undefined) };
    dataSource.transaction.mockImplementation((cb) => cb(manager));
    const remainingVenue = { id: 'venue-2', ownerId: 'owner-1', isDefault: false };
    venuesRepo.find.mockResolvedValue([remainingVenue]);
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    await service.remove('owner-1', 'venue-1');

    expect(venuesRepo.find).toHaveBeenCalledWith({
      where: { ownerId: 'owner-1' },
      order: { createdAt: 'ASC' },
    });
    expect(venuesRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'venue-2', isDefault: true }),
    );
  });

  it('does not touch other venues when the deleted venue was not default', async () => {
    const { service, venuesRepo, courtsRepo, bookingsRepo, dataSource } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1', isDefault: false });
    courtsRepo.find.mockResolvedValue([]);
    bookingsRepo.count.mockResolvedValue(0);
    const manager = { delete: jest.fn().mockResolvedValue(undefined) };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    await service.remove('owner-1', 'venue-1');

    expect(venuesRepo.find).not.toHaveBeenCalled();
  });
});

describe('VenuesService.findMineWithMetrics', () => {
  it('returns venues enriched with courtsCount/bookingsThisMonth/revenueThisMonth', async () => {
    const { service, venuesRepo, courtsRepo, bookingsRepo, paymentsRepo } =
      await buildTestingModule();
    venuesRepo.createQueryBuilder.mockReturnValue(
      buildMockQueryBuilder([
        {
          id: 'venue-1',
          name: 'A',
          ownerId: 'owner-1',
          isDefault: true,
          createdAt: new Date('2026-01-01'),
        },
      ]),
    );
    courtsRepo.find.mockResolvedValue([{ id: 'court-1', venueId: 'venue-1' }]);
    bookingsRepo.createQueryBuilder.mockReturnValue(
      buildMockRawQueryBuilder([{ courtId: 'court-1', count: '2' }]),
    );
    paymentsRepo.createQueryBuilder.mockReturnValue(
      buildMockRawQueryBuilder([{ courtId: 'court-1', revenue: '300000' }]),
    );

    const result = await service.findMineWithMetrics('owner-1');

    expect(result).toEqual([
      expect.objectContaining({
        id: 'venue-1',
        courtsCount: 1,
        bookingsThisMonth: 2,
        revenueThisMonth: 300000,
      }),
    ]);
  });

  it('returns an empty array without querying courts/bookings when the owner has no venues', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.createQueryBuilder.mockReturnValue(buildMockQueryBuilder([]));

    const result = await service.findMineWithMetrics('owner-1');

    expect(result).toEqual([]);
    expect(courtsRepo.find).not.toHaveBeenCalled();
  });

  it('sorts by name when sort is "name"', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.createQueryBuilder.mockReturnValue(
      buildMockQueryBuilder([
        { id: 'venue-b', name: 'B Venue', ownerId: 'owner-1', isDefault: false, createdAt: new Date('2026-01-01') },
        { id: 'venue-a', name: 'A Venue', ownerId: 'owner-1', isDefault: true, createdAt: new Date('2026-02-01') },
      ]),
    );
    courtsRepo.find.mockResolvedValue([]);

    const result = await service.findMineWithMetrics('owner-1', { sort: 'name' });

    expect(result.map((v) => v.id)).toEqual(['venue-a', 'venue-b']);
  });
});

describe('VenuesService.uploadLogo', () => {
  it('sets logoUrl from the uploaded filename', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1', logoUrl: null });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.uploadLogo('owner-1', 'venue-1', {
      filename: 'abc123.png',
    } as Express.Multer.File);

    expect(result.logoUrl).toBe('/uploads/venues/venue-1/abc123.png');
  });

  it('throws NotFoundException for a venue not owned by the caller', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue(null);

    await expect(
      service.uploadLogo('owner-1', 'venue-1', { filename: 'abc.png' } as Express.Multer.File),
    ).rejects.toThrow('Venue venue-1 không tồn tại');
  });
});

describe('VenuesService images', () => {
  it('addImage creates an image for an owned venue', async () => {
    const { service, venuesRepo, venueImagesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    venueImagesRepo.create.mockImplementation((data) => data);
    venueImagesRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'image-1', ...data }),
    );

    const result = await service.addImage('owner-1', 'venue-1', {
      url: 'https://example.com/a.jpg',
    });

    expect(result.venueId).toBe('venue-1');
    expect(result.url).toBe('https://example.com/a.jpg');
  });

  it('removeImage deletes an image belonging to an owned venue', async () => {
    const { service, venuesRepo, venueImagesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    venueImagesRepo.findOne.mockResolvedValue({ id: 'image-1', venueId: 'venue-1' });

    await service.removeImage('owner-1', 'venue-1', 'image-1');

    expect(venueImagesRepo.remove).toHaveBeenCalledWith({
      id: 'image-1',
      venueId: 'venue-1',
    });
  });

  it('removeImage throws NotFoundException when the image does not exist', async () => {
    const { service, venuesRepo, venueImagesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    venueImagesRepo.findOne.mockResolvedValue(null);

    await expect(
      service.removeImage('owner-1', 'venue-1', 'image-1'),
    ).rejects.toThrow('Ảnh image-1 không tồn tại');
  });
});

describe('VenuesService approval', () => {
  it('approveVenue activates a pending venue and sends an approval email', async () => {
    const { service, venuesRepo, usersService, notificationsService } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      name: 'ABC Pickleball',
      ownerId: 'owner-1',
      status: VenueStatus.PENDING_APPROVAL,
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));
    usersService.findById.mockResolvedValue({
      id: 'owner-1',
      email: 'owner-1@test.com',
      fullName: 'Owner One',
    });

    const result = await service.approveVenue('venue-1');

    expect(result.status).toBe(VenueStatus.ACTIVE);
    expect(notificationsService.notifyVenueApproved).toHaveBeenCalledWith({
      to: 'owner-1@test.com',
      ownerName: 'Owner One',
      venueName: 'ABC Pickleball',
    });
  });

  it('approveVenue rejects a venue that is not pending approval', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      status: VenueStatus.ACTIVE,
    });

    await expect(service.approveVenue('venue-1')).rejects.toThrow();
  });

  it('rejectVenue marks a pending venue as rejected and sends a rejection email with the reason', async () => {
    const { service, venuesRepo, usersService, notificationsService } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      name: 'ABC Pickleball',
      ownerId: 'owner-1',
      status: VenueStatus.PENDING_APPROVAL,
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));
    usersService.findById.mockResolvedValue({
      id: 'owner-1',
      email: 'owner-1@test.com',
      fullName: 'Owner One',
    });

    const result = await service.rejectVenue('venue-1', 'Thiếu giấy phép');

    expect(result.status).toBe(VenueStatus.REJECTED);
    expect(notificationsService.notifyVenueRejected).toHaveBeenCalledWith({
      to: 'owner-1@test.com',
      ownerName: 'Owner One',
      venueName: 'ABC Pickleball',
      reason: 'Thiếu giấy phép',
    });
  });

  it('findPendingVenues queries by pending_approval status', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1' }]);

    const result = await service.findPendingVenues();

    expect(venuesRepo.find).toHaveBeenCalledWith({
      where: { status: VenueStatus.PENDING_APPROVAL },
    });
    expect(result).toEqual([{ id: 'venue-1' }]);
  });
});

describe('VenuesService.findByIdOrThrow', () => {
  it('returns the venue regardless of status or owner', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-2' });

    const result = await service.findByIdOrThrow('venue-1');

    expect(result.id).toBe('venue-1');
  });

  it('throws NotFoundException when the venue does not exist', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue(null);

    await expect(service.findByIdOrThrow('venue-1')).rejects.toThrow(
      'Venue venue-1 không tồn tại',
    );
  });
});

describe('VenuesService public reads', () => {
  it('searchPublic without a query returns only active, non-hidden venues', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1' }]);

    const result = await service.searchPublic();

    expect(venuesRepo.find).toHaveBeenCalledWith({
      where: { status: VenueStatus.ACTIVE, isHidden: false },
    });
    expect(result).toEqual([{ id: 'venue-1' }]);
  });

  it('findPublicById throws NotFoundException for an inactive, hidden, or missing venue', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue(null);

    await expect(service.findPublicById('venue-1')).rejects.toThrow(
      'Venue venue-1 không tồn tại',
    );
    expect(venuesRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'venue-1', status: VenueStatus.ACTIVE, isHidden: false },
    });
  });
});

describe('VenuesService.findPublicBySlug', () => {
  it('returns the venue for an active, non-hidden slug', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', slug: 'abc' });

    const result = await service.findPublicBySlug('abc');

    expect(venuesRepo.findOne).toHaveBeenCalledWith({
      where: { slug: 'abc', status: VenueStatus.ACTIVE, isHidden: false },
    });
    expect(result.id).toBe('venue-1');
  });

  it('throws NotFoundException when the slug does not match any active, visible venue', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue(null);

    await expect(service.findPublicBySlug('missing')).rejects.toThrow(
      'Venue với slug missing không tồn tại',
    );
  });
});

describe('VenuesService.findImagesByVenue', () => {
  it('returns images for the given venue', async () => {
    const { service, venueImagesRepo } = await buildTestingModule();
    venueImagesRepo.find.mockResolvedValue([
      { id: 'image-1', venueId: 'venue-1', url: 'https://example.com/a.jpg' },
    ]);

    const result = await service.findImagesByVenue('venue-1');

    expect(venueImagesRepo.find).toHaveBeenCalledWith({
      where: { venueId: 'venue-1' },
    });
    expect(result).toEqual([
      { id: 'image-1', venueId: 'venue-1', url: 'https://example.com/a.jpg' },
    ]);
  });
});
