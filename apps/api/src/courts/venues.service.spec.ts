import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, ILike, In } from 'typeorm';
import { VenuesService } from './venues.service';
import { Venue, VenueStatus } from './entities/venue.entity';
import { VenueImage } from './entities/venue-image.entity';
import { VenueSlugHistory } from './entities/venue-slug-history.entity';
import { VenueOperatingHours } from './entities/venue-operating-hours.entity';
import { Court, CourtStatus } from './entities/court.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { BookingSlot } from '../bookings/entities/booking-slot.entity';
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

const mockOperatingHoursRepository = () => ({
  find: jest.fn(),
});

const mockCourtsRepository = () => ({
  find: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockBookingsRepository = () => ({
  count: jest.fn(),
  createQueryBuilder: jest.fn(),
});

const mockBookingSlotsRepository = () => ({
  find: jest.fn(),
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
      {
        provide: getRepositoryToken(VenueOperatingHours),
        useFactory: mockOperatingHoursRepository,
      },
      { provide: getRepositoryToken(Court), useFactory: mockCourtsRepository },
      {
        provide: getRepositoryToken(Booking),
        useFactory: mockBookingsRepository,
      },
      {
        provide: getRepositoryToken(BookingSlot),
        useFactory: mockBookingSlotsRepository,
      },
      {
        provide: getRepositoryToken(Payment),
        useFactory: mockPaymentsRepository,
      },
      { provide: UsersService, useFactory: mockUsersService },
      { provide: NotificationsService, useFactory: mockNotificationsService },
      { provide: DataSource, useFactory: mockDataSource },
    ],
  }).compile();

  return {
    service: module.get(VenuesService),
    venuesRepo: module.get(getRepositoryToken(Venue)),
    venueImagesRepo: module.get(getRepositoryToken(VenueImage)),
    slugHistoryRepo: module.get(getRepositoryToken(VenueSlugHistory)),
    operatingHoursRepo: module.get(getRepositoryToken(VenueOperatingHours)),
    courtsRepo: module.get(getRepositoryToken(Court)),
    bookingsRepo: module.get(getRepositoryToken(Booking)),
    bookingSlotsRepo: module.get(getRepositoryToken(BookingSlot)),
    paymentsRepo: module.get(getRepositoryToken(Payment)),
    usersService: module.get(UsersService),
    notificationsService: module.get(NotificationsService),
    dataSource: module.get(DataSource),
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
  qb.orderBy = jest.fn().mockReturnValue(qb);
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
    venuesRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'venue-1', ...data }),
    );

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
    venuesRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'venue-2', ...data }),
    );

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
    venuesRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'venue-1', ...data }),
    );

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
    venuesRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'venue-1', ...data }),
    );

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
    venuesRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'venue-2', ...data }),
    );

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
    venuesRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'venue-1', ...data }),
    );

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
    venuesRepo.findOne.mockResolvedValue({
      id: 'other-venue',
      slug: 'taken-slug',
    });

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
    venuesRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'venue-1', ...data }),
    );

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

    const result = await service.update('owner-1', 'venue-1', {
      phone: '0368886999',
    });

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
    const { service, venuesRepo, slugHistoryRepo, dataSource } =
      await buildTestingModule();
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

    const result = await service.update('owner-1', 'venue-1', {
      slug: 'new-slug',
    });

    expect(result.slug).toBe('new-slug');
    expect(manager.insert).toHaveBeenCalledWith(VenueSlugHistory, {
      venueId: 'venue-1',
      oldSlug: 'old-slug',
    });
  });

  it('allows the first-ever slug change even if the venue itself was just updated', async () => {
    const { service, venuesRepo, slugHistoryRepo, dataSource } =
      await buildTestingModule();
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

    const result = await service.update('owner-1', 'venue-1', {
      slug: 'new-slug',
    });

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
      .mockResolvedValueOnce({
        id: 'venue-1',
        ownerId: 'owner-1',
        slug: 'old-slug',
      })
      .mockResolvedValueOnce({ id: 'venue-2', slug: 'taken-slug' });

    await expect(
      service.update('owner-1', 'venue-1', { slug: 'taken-slug' }),
    ).rejects.toThrow('Đường dẫn này đã được sử dụng');
  });

  it('throws BadRequestException at 3 changes already within the last 180 days', async () => {
    const { service, venuesRepo, slugHistoryRepo } = await buildTestingModule();
    venuesRepo.findOne
      .mockResolvedValueOnce({
        id: 'venue-1',
        ownerId: 'owner-1',
        slug: 'old-slug',
      })
      .mockResolvedValueOnce(null);
    slugHistoryRepo.count.mockResolvedValue(3);

    await expect(
      service.update('owner-1', 'venue-1', { slug: 'new-slug' }),
    ).rejects.toThrow('Đã đạt giới hạn đổi đường dẫn (3 lần/180 ngày)');
  });

  it('throws BadRequestException when the last change was under 60 days ago', async () => {
    const { service, venuesRepo, slugHistoryRepo } = await buildTestingModule();
    venuesRepo.findOne
      .mockResolvedValueOnce({
        id: 'venue-1',
        ownerId: 'owner-1',
        slug: 'old-slug',
      })
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
      .mockResolvedValueOnce({
        id: 'venue-2',
        ownerId: 'owner-1',
        isDefault: false,
      })
      .mockResolvedValueOnce({
        id: 'venue-2',
        ownerId: 'owner-1',
        isDefault: true,
      });
    const manager = { update: jest.fn().mockResolvedValue(undefined) };
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.setDefault('owner-1', 'venue-2');

    expect(manager.update).toHaveBeenCalledWith(
      Venue,
      { ownerId: 'owner-1' },
      { isDefault: false },
    );
    expect(manager.update).toHaveBeenCalledWith(
      Venue,
      { id: 'venue-2' },
      { isDefault: true },
    );
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
    const { service, venuesRepo, courtsRepo, bookingsRepo } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      isDefault: false,
    });
    courtsRepo.find.mockResolvedValue([{ id: 'court-1', venueId: 'venue-1' }]);
    bookingsRepo.count.mockResolvedValue(1);

    await expect(service.remove('owner-1', 'venue-1')).rejects.toThrow(
      'Chi nhánh đã có lịch sử đặt sân',
    );
  });

  it('deletes the venue and its courts when there is no booking history', async () => {
    const { service, venuesRepo, courtsRepo, bookingsRepo, dataSource } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      isDefault: false,
    });
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
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      isDefault: true,
    });
    courtsRepo.find.mockResolvedValue([]);
    bookingsRepo.count.mockResolvedValue(0);
    const manager = { delete: jest.fn().mockResolvedValue(undefined) };
    dataSource.transaction.mockImplementation((cb) => cb(manager));
    const remainingVenue = {
      id: 'venue-2',
      ownerId: 'owner-1',
      isDefault: false,
    };
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
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      isDefault: false,
    });
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
        {
          id: 'venue-b',
          name: 'B Venue',
          ownerId: 'owner-1',
          isDefault: false,
          createdAt: new Date('2026-01-01'),
        },
        {
          id: 'venue-a',
          name: 'A Venue',
          ownerId: 'owner-1',
          isDefault: true,
          createdAt: new Date('2026-02-01'),
        },
      ]),
    );
    courtsRepo.find.mockResolvedValue([]);

    const result = await service.findMineWithMetrics('owner-1', {
      sort: 'name',
    });

    expect(result.map((v) => v.id)).toEqual(['venue-a', 'venue-b']);
  });
});

describe('VenuesService.uploadLogo', () => {
  it('sets logoUrl from the uploaded filename', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      ownerId: 'owner-1',
      logoUrl: null,
    });
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
      service.uploadLogo('owner-1', 'venue-1', {
        filename: 'abc.png',
      } as Express.Multer.File),
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
    venueImagesRepo.findOne.mockResolvedValue({
      id: 'image-1',
      venueId: 'venue-1',
    });

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

describe('VenuesService.listActiveCities', () => {
  it('groups active, non-hidden venues by city, sorted alphabetically', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.createQueryBuilder.mockReturnValue(
      buildMockRawQueryBuilder([
        { city: 'Hà Nội', count: '3' },
        { city: 'Hồ Chí Minh', count: '5' },
      ]),
    );

    const result = await service.listActiveCities();

    expect(result).toEqual([
      { city: 'Hà Nội', count: 3 },
      { city: 'Hồ Chí Minh', count: 5 },
    ]);
  });

  it('returns an empty array when there are no active venues', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.createQueryBuilder.mockReturnValue(buildMockRawQueryBuilder([]));

    expect(await service.listActiveCities()).toEqual([]);
  });
});

describe('VenuesService.listForMap', () => {
  it('returns active, non-hidden venues with courtsCount and coordinates, unpaginated', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.find.mockResolvedValue([
      {
        id: 'venue-1',
        name: 'A',
        address: '1 Đường A',
        city: 'Hà Nội',
        district: 'Cầu Giấy',
        latitude: 21.03,
        longitude: 105.8,
        logoUrl: '/uploads/venues/venue-1/logo.webp',
      },
      {
        id: 'venue-2',
        name: 'B',
        address: '2 Đường B',
        city: 'Hà Nội',
        district: null,
        latitude: null,
        longitude: null,
        logoUrl: null,
      },
    ]);
    courtsRepo.find.mockResolvedValue([{ id: 'court-1', venueId: 'venue-1' }]);

    const result = await service.listForMap();

    expect(venuesRepo.find).toHaveBeenCalledWith({
      where: { status: VenueStatus.ACTIVE, isHidden: false },
    });
    expect(result).toEqual([
      {
        id: 'venue-1',
        name: 'A',
        address: '1 Đường A',
        city: 'Hà Nội',
        district: 'Cầu Giấy',
        courtsCount: 1,
        latitude: 21.03,
        longitude: 105.8,
        logoUrl: '/uploads/venues/venue-1/logo.webp',
      },
      {
        id: 'venue-2',
        name: 'B',
        address: '2 Đường B',
        city: 'Hà Nội',
        district: null,
        courtsCount: 0,
        latitude: null,
        longitude: null,
        logoUrl: null,
      },
    ]);
  });

  it('returns an empty array without querying courts when no venue matches', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.find.mockResolvedValue([]);

    const result = await service.listForMap();

    expect(result).toEqual([]);
    expect(courtsRepo.find).not.toHaveBeenCalled();
  });

  it('filters by query and exact city, reusing the same where-clause shape as searchPublic', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.find.mockResolvedValue([]);

    await service.listForMap('Sport', 'Hà Nội');

    expect(venuesRepo.find).toHaveBeenCalledWith({
      where: [
        {
          status: VenueStatus.ACTIVE,
          isHidden: false,
          city: 'Hà Nội',
          name: ILike('%Sport%'),
        },
        {
          status: VenueStatus.ACTIVE,
          isHidden: false,
          city: 'Hà Nội',
          address: ILike('%Sport%'),
        },
      ],
    });
  });
});

describe('VenuesService public reads', () => {
  it('searchPublic without a query returns only active, non-hidden venues, newest first, wrapped in a page envelope', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(1);
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1', name: 'A' }]);
    courtsRepo.find.mockResolvedValue([]);

    const result = await service.searchPublic();

    expect(venuesRepo.count).toHaveBeenCalledWith({
      where: { status: VenueStatus.ACTIVE, isHidden: false },
    });
    expect(venuesRepo.find).toHaveBeenCalledWith({
      where: { status: VenueStatus.ACTIVE, isHidden: false },
      order: { createdAt: 'DESC' },
      skip: 0,
      take: 20,
    });
    expect(result).toEqual({
      items: [{ id: 'venue-1', name: 'A', courtsCount: 0 }],
      total: 1,
      page: 1,
      pageSize: 20,
    });
  });

  it('enriches each venue with its count of active courts', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(2);
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1' }, { id: 'venue-2' }]);
    courtsRepo.find.mockResolvedValue([
      { id: 'court-1', venueId: 'venue-1' },
      { id: 'court-2', venueId: 'venue-1' },
      { id: 'court-3', venueId: 'venue-2' },
    ]);

    const result = await service.searchPublic();

    expect(courtsRepo.find).toHaveBeenCalledWith({
      where: { venueId: In(['venue-1', 'venue-2']), status: CourtStatus.ACTIVE },
    });
    expect(result.items).toEqual([
      { id: 'venue-1', courtsCount: 2 },
      { id: 'venue-2', courtsCount: 1 },
    ]);
  });

  it('returns an empty result without querying venues or courts when total is 0', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);

    const result = await service.searchPublic();

    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(venuesRepo.find).not.toHaveBeenCalled();
    expect(courtsRepo.find).not.toHaveBeenCalled();
  });

  it('with a keyword and no city, matches by name, address, or city (3 OR-branches)', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);

    await service.searchPublic('Sport');

    expect(venuesRepo.count).toHaveBeenCalledWith({
      where: [
        { status: VenueStatus.ACTIVE, isHidden: false, name: ILike('%Sport%') },
        { status: VenueStatus.ACTIVE, isHidden: false, address: ILike('%Sport%') },
        { status: VenueStatus.ACTIVE, isHidden: false, city: ILike('%Sport%') },
      ],
    });
  });

  it('filters by an exact city match', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(1);
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1', city: 'Hà Nội' }]);
    courtsRepo.find.mockResolvedValue([]);

    await service.searchPublic(undefined, undefined, undefined, 'Hà Nội');

    expect(venuesRepo.count).toHaveBeenCalledWith({
      where: { status: VenueStatus.ACTIVE, isHidden: false, city: 'Hà Nội' },
    });
  });

  it('combines a keyword with an exact city filter using only the name/address OR-branches (2, not 3)', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);

    await service.searchPublic('Sport', undefined, undefined, 'Hà Nội');

    expect(venuesRepo.count).toHaveBeenCalledWith({
      where: [
        {
          status: VenueStatus.ACTIVE,
          isHidden: false,
          city: 'Hà Nội',
          name: ILike('%Sport%'),
        },
        {
          status: VenueStatus.ACTIVE,
          isHidden: false,
          city: 'Hà Nội',
          address: ILike('%Sport%'),
        },
      ],
    });
  });

  it('sorts by name ascending when sort="name"', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(1);
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1' }]);
    courtsRepo.find.mockResolvedValue([]);

    await service.searchPublic(undefined, undefined, undefined, undefined, 'name');

    expect(venuesRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { name: 'ASC' } }),
    );
  });

  it('sorts by city then name ascending when sort="city"', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(1);
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1' }]);
    courtsRepo.find.mockResolvedValue([]);

    await service.searchPublic(undefined, undefined, undefined, undefined, 'city');

    expect(venuesRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ order: { city: 'ASC', name: 'ASC' } }),
    );
  });

  it('throws for an invalid sort value', async () => {
    const { service } = await buildTestingModule();
    await expect(
      service.searchPublic(undefined, undefined, undefined, undefined, 'invalid'),
    ).rejects.toThrow("sort phải là 'name', 'courts' hoặc 'city'");
  });

  it('paginates with the given page/pageSize', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(30);
    venuesRepo.find.mockResolvedValue([{ id: 'venue-6' }]);
    courtsRepo.find.mockResolvedValue([]);

    const result = await service.searchPublic(
      undefined, undefined, undefined, undefined, undefined, '2', '5',
    );

    expect(venuesRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 5, take: 5 }),
    );
    expect(result.page).toBe(2);
    expect(result.pageSize).toBe(5);
    expect(result.total).toBe(30);
  });

  it('clamps an out-of-range page to 1 and an out-of-range pageSize to 100', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.count.mockResolvedValue(0);

    const result = await service.searchPublic(
      undefined, undefined, undefined, undefined, undefined, '0', '9999',
    );

    expect(result.page).toBe(1);
    expect(result.pageSize).toBe(100);
  });

  it('searchPublic throws when only date is given without time', async () => {
    const { service } = await buildTestingModule();
    await expect(service.searchPublic(undefined, '2099-01-01')).rejects.toThrow(
      'date và time phải được truyền cùng nhau',
    );
  });

  it('searchPublic throws when only time is given without date', async () => {
    const { service } = await buildTestingModule();
    await expect(
      service.searchPublic(undefined, undefined, '10:00'),
    ).rejects.toThrow('date và time phải được truyền cùng nhau');
  });

  it('searchPublic throws for a malformed date', async () => {
    const { service } = await buildTestingModule();
    await expect(
      service.searchPublic(undefined, '01-01-2099', '10:00'),
    ).rejects.toThrow('date phải theo định dạng YYYY-MM-DD');
  });

  it('searchPublic throws for a past date', async () => {
    const { service } = await buildTestingModule();
    await expect(
      service.searchPublic(undefined, '2020-01-01', '10:00'),
    ).rejects.toThrow('Không thể tìm sân của ngày trong quá khứ');
  });

  it('searchPublic throws for a malformed time', async () => {
    const { service } = await buildTestingModule();
    await expect(
      service.searchPublic(undefined, '2099-01-01', '25:00'),
    ).rejects.toThrow('time phải theo định dạng HH:mm');
  });

  it('searchPublic with date+time only returns venues with a court free at that time', async () => {
    const { service, venuesRepo, courtsRepo, bookingSlotsRepo } =
      await buildTestingModule();
    venuesRepo.find
      .mockResolvedValueOnce([
        { id: 'venue-free' },
        { id: 'venue-booked' },
        { id: 'venue-no-matching-grid' },
      ])
      .mockResolvedValueOnce([{ id: 'venue-free', name: 'Free Venue' }]);
    venuesRepo.count.mockResolvedValue(1);
    courtsRepo.find
      .mockResolvedValueOnce([
        {
          id: 'court-free',
          venueId: 'venue-free',
          openTime: '06:00',
          closeTime: '22:00',
          slotDurationMinutes: 60,
        },
        {
          id: 'court-booked',
          venueId: 'venue-booked',
          openTime: '06:00',
          closeTime: '22:00',
          slotDurationMinutes: 60,
        },
        {
          id: 'court-odd-grid',
          venueId: 'venue-no-matching-grid',
          openTime: '06:00',
          closeTime: '22:00',
          slotDurationMinutes: 90,
        },
      ])
      .mockResolvedValueOnce([]);
    bookingSlotsRepo.find.mockResolvedValue([
      { courtId: 'court-booked', date: '2099-01-01', slotStart: '10:00' },
    ]);

    const result = await service.searchPublic(undefined, '2099-01-01', '10:00');

    expect(bookingSlotsRepo.find).toHaveBeenCalledWith({
      where: {
        courtId: In(['court-free', 'court-booked']),
        date: '2099-01-01',
        slotStart: '10:00',
      },
    });
    expect(venuesRepo.count).toHaveBeenCalledWith({
      where: {
        status: VenueStatus.ACTIVE,
        isHidden: false,
        id: In(['venue-free']),
      },
    });
    expect(result.items.map((v) => v.id)).toEqual(['venue-free']);
  });

  it('returns an empty result when date+time is given but no venue has a free slot', async () => {
    const { service, venuesRepo, courtsRepo, bookingSlotsRepo } =
      await buildTestingModule();
    venuesRepo.find.mockResolvedValueOnce([{ id: 'venue-booked' }]);
    courtsRepo.find.mockResolvedValueOnce([
      {
        id: 'court-booked',
        venueId: 'venue-booked',
        openTime: '06:00',
        closeTime: '22:00',
        slotDurationMinutes: 60,
      },
    ]);
    bookingSlotsRepo.find.mockResolvedValue([
      { courtId: 'court-booked', date: '2099-01-01', slotStart: '10:00' },
    ]);

    const result = await service.searchPublic(undefined, '2099-01-01', '10:00');

    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(venuesRepo.count).not.toHaveBeenCalled();
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

describe('VenuesService.searchPublic — sort=courts', () => {
  it('orders venues by count of active courts, descending, tie-broken by name ascending', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.find
      .mockResolvedValueOnce([
        { id: 'venue-a', name: 'Venue A' },
        { id: 'venue-b', name: 'Venue B' },
        { id: 'venue-c', name: 'Venue C' },
      ])
      .mockResolvedValueOnce([
        { id: 'venue-a', name: 'Venue A' },
        { id: 'venue-b', name: 'Venue B' },
        { id: 'venue-c', name: 'Venue C' },
      ]);
    courtsRepo.createQueryBuilder.mockReturnValue(
      buildMockRawQueryBuilder([
        { venueId: 'venue-a', count: '1' },
        { venueId: 'venue-c', count: '3' },
      ]),
    );

    const result = await service.searchPublic(
      undefined, undefined, undefined, undefined, 'courts',
    );

    expect(result.items.map((v) => v.id)).toEqual([
      'venue-c', 'venue-a', 'venue-b',
    ]);
    expect(result.items.map((v) => v.courtsCount)).toEqual([3, 1, 0]);
    expect(result.total).toBe(3);
  });

  it('paginates the sorted-by-count list', async () => {
    const { service, venuesRepo, courtsRepo } = await buildTestingModule();
    venuesRepo.find
      .mockResolvedValueOnce([
        { id: 'venue-a', name: 'Venue A' },
        { id: 'venue-b', name: 'Venue B' },
        { id: 'venue-c', name: 'Venue C' },
      ])
      .mockResolvedValueOnce([{ id: 'venue-b', name: 'Venue B' }]);
    courtsRepo.createQueryBuilder.mockReturnValue(
      buildMockRawQueryBuilder([
        { venueId: 'venue-a', count: '3' },
        { venueId: 'venue-b', count: '2' },
        { venueId: 'venue-c', count: '1' },
      ]),
    );

    const result = await service.searchPublic(
      undefined, undefined, undefined, undefined, 'courts', '2', '1',
    );

    expect(result.items.map((v) => v.id)).toEqual(['venue-b']);
    expect(result.total).toBe(3);
    expect(result.page).toBe(2);
  });

  it('returns an empty result when no venue matches the filters', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.find.mockResolvedValueOnce([]);

    const result = await service.searchPublic(
      undefined, undefined, undefined, undefined, 'courts',
    );

    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
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

describe('VenuesService.getOperatingHours', () => {
  it('returns the default 7-day schedule when no rows exist yet', async () => {
    const { service, venuesRepo, operatingHoursRepo } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    operatingHoursRepo.find.mockResolvedValue([]);

    const result = await service.getOperatingHours('owner-1', 'venue-1');

    expect(result).toHaveLength(7);
    expect(result).toEqual(
      expect.arrayContaining([
        { dayOfWeek: 0, isOpen: true, openTime: '06:00', closeTime: '22:00' },
        { dayOfWeek: 6, isOpen: true, openTime: '06:00', closeTime: '22:00' },
      ]),
    );
  });

  it('returns saved rows mapped to the view shape', async () => {
    const { service, venuesRepo, operatingHoursRepo } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    operatingHoursRepo.find.mockResolvedValue([
      {
        id: 'row-1',
        venueId: 'venue-1',
        dayOfWeek: 1,
        isOpen: false,
        openTime: null,
        closeTime: null,
      },
    ]);

    const result = await service.getOperatingHours('owner-1', 'venue-1');

    expect(result).toEqual([
      { dayOfWeek: 1, isOpen: false, openTime: null, closeTime: null },
    ]);
  });

  it('normalizes Postgres HH:mm:ss time values down to HH:mm', async () => {
    const { service, venuesRepo, operatingHoursRepo } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    operatingHoursRepo.find.mockResolvedValue([
      {
        id: 'row-1',
        venueId: 'venue-1',
        dayOfWeek: 1,
        isOpen: true,
        openTime: '07:00:00',
        closeTime: '21:00:00',
      },
    ]);

    const result = await service.getOperatingHours('owner-1', 'venue-1');

    expect(result).toEqual([
      { dayOfWeek: 1, isOpen: true, openTime: '07:00', closeTime: '21:00' },
    ]);
  });
});

describe('VenuesService.getOperatingHoursPublic', () => {
  it('returns the default 7-day schedule when no rows exist yet', async () => {
    const { service, operatingHoursRepo } = await buildTestingModule();
    operatingHoursRepo.find.mockResolvedValue([]);

    const result = await service.getOperatingHoursPublic('venue-1');

    expect(operatingHoursRepo.find).toHaveBeenCalledWith({
      where: { venueId: 'venue-1' },
      order: { dayOfWeek: 'ASC' },
    });
    expect(result).toHaveLength(7);
    expect(result).toEqual(
      expect.arrayContaining([
        { dayOfWeek: 0, isOpen: true, openTime: '06:00', closeTime: '22:00' },
        { dayOfWeek: 6, isOpen: true, openTime: '06:00', closeTime: '22:00' },
      ]),
    );
  });

  it('returns saved rows mapped to the view shape, without checking ownership', async () => {
    const { service, operatingHoursRepo, venuesRepo } =
      await buildTestingModule();
    operatingHoursRepo.find.mockResolvedValue([
      {
        id: 'row-1',
        venueId: 'venue-1',
        dayOfWeek: 1,
        isOpen: true,
        openTime: '07:00:00',
        closeTime: '21:00:00',
      },
    ]);

    const result = await service.getOperatingHoursPublic('venue-1');

    expect(result).toEqual([
      { dayOfWeek: 1, isOpen: true, openTime: '07:00', closeTime: '21:00' },
    ]);
    expect(venuesRepo.findOne).not.toHaveBeenCalled();
  });
});

describe('VenuesService.setOperatingHours', () => {
  function sevenDays(
    overrides: Partial<{
      dayOfWeek: number;
      isOpen: boolean;
      openTime?: string;
      closeTime?: string;
    }>[] = [],
  ) {
    const base = [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({
      dayOfWeek,
      isOpen: true,
      openTime: '08:00',
      closeTime: '20:00',
    }));
    for (const override of overrides) {
      const idx = base.findIndex((d) => d.dayOfWeek === override.dayOfWeek);
      base[idx] = { ...base[idx], ...override };
    }
    return base;
  }

  it('rejects a payload that is not exactly 7 items', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });

    await expect(
      service.setOperatingHours(
        'owner-1',
        'venue-1',
        sevenDays().slice(0, 6) as never,
      ),
    ).rejects.toThrow('Phải gửi đúng 7 ngày trong tuần');
  });

  it('rejects duplicate dayOfWeek values', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    const items = sevenDays();
    items[1] = { ...items[1], dayOfWeek: 0 };

    await expect(
      service.setOperatingHours('owner-1', 'venue-1', items as never),
    ).rejects.toThrow('dayOfWeek phải phủ đủ 0-6, không trùng');
  });

  it('rejects openTime >= closeTime when isOpen is true', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    const items = sevenDays([
      { dayOfWeek: 2, isOpen: true, openTime: '20:00', closeTime: '08:00' },
    ]);

    await expect(
      service.setOperatingHours('owner-1', 'venue-1', items as never),
    ).rejects.toThrow('giờ mở phải trước giờ đóng');
  });

  it('rejects openTime/closeTime present while isOpen is false', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    const items = sevenDays([
      { dayOfWeek: 3, isOpen: false, openTime: '08:00', closeTime: '20:00' },
    ]);

    await expect(
      service.setOperatingHours('owner-1', 'venue-1', items as never),
    ).rejects.toThrow('không được có giờ mở/đóng');
  });

  it('deletes existing rows and inserts the new 7 inside a transaction', async () => {
    const { service, venuesRepo, dataSource, operatingHoursRepo } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    const manager = {
      delete: jest.fn().mockResolvedValue(undefined),
      create: jest.fn((_entity: unknown, data: unknown) => data),
      save: jest.fn().mockResolvedValue(undefined),
    };
    dataSource.transaction.mockImplementation((cb: (m: unknown) => unknown) =>
      cb(manager),
    );
    operatingHoursRepo.find.mockResolvedValue(
      sevenDays().map((d) => ({ ...d, id: 'x', venueId: 'venue-1' })),
    );

    await service.setOperatingHours('owner-1', 'venue-1', sevenDays());

    expect(manager.delete).toHaveBeenCalledWith(VenueOperatingHours, {
      venueId: 'venue-1',
    });
    expect(manager.save).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ dayOfWeek: 0, venueId: 'venue-1' }),
      ]),
    );
  });
});
