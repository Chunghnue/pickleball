import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { BookingsService } from './bookings.service';
import { Booking, BookingStatus } from './entities/booking.entity';
import { BookingSlot } from './entities/booking-slot.entity';
import { CourtsService } from '../courts/courts.service';
import { VenuesService } from '../courts/venues.service';
import { VenueStatus } from '../courts/entities/venue.entity';

const mockBookingsRepository = () => {
  const queryBuilder = {
    update: jest.fn().mockReturnThis(),
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    execute: jest.fn().mockResolvedValue(undefined),
  };
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(() => queryBuilder),
  };
};

const mockBookingSlotsRepository = () => ({
  find: jest.fn(),
});

const mockCourtsService = () => ({
  findByIdOrThrow: jest.fn(),
  findByVenueForOwner: jest.fn(),
  getSlotsForDate: jest.fn(),
});

const mockVenuesService = () => ({
  findByIdOrThrow: jest.fn(),
  getOwnedVenueOrThrow: jest.fn(),
});

function buildMockManager() {
  return {
    create: jest.fn((_entity: unknown, data: unknown) => data),
    save: jest.fn((data: unknown) =>
      Array.isArray(data)
        ? Promise.resolve(data)
        : Promise.resolve({ id: 'booking-1', ...(data as object) }),
    ),
    delete: jest.fn(),
  };
}

const mockDataSource = () => ({
  transaction: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      BookingsService,
      {
        provide: getRepositoryToken(Booking),
        useFactory: mockBookingsRepository,
      },
      {
        provide: getRepositoryToken(BookingSlot),
        useFactory: mockBookingSlotsRepository,
      },
      { provide: CourtsService, useFactory: mockCourtsService },
      { provide: VenuesService, useFactory: mockVenuesService },
      { provide: DataSource, useFactory: mockDataSource },
    ],
  }).compile();

  return {
    service: module.get(BookingsService),
    bookingsRepo: module.get(getRepositoryToken(Booking)) as ReturnType<
      typeof mockBookingsRepository
    >,
    bookingSlotsRepo: module.get(
      getRepositoryToken(BookingSlot),
    ) as ReturnType<typeof mockBookingSlotsRepository>,
    courtsService: module.get(CourtsService) as ReturnType<
      typeof mockCourtsService
    >,
    venuesService: module.get(VenuesService) as ReturnType<
      typeof mockVenuesService
    >,
    dataSource: module.get(DataSource) as ReturnType<typeof mockDataSource>,
  };
}

describe('BookingsService.create', () => {
  const FIXED_TODAY = new Date('2026-08-24T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_TODAY);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const ACTIVE_COURT = {
    id: 'court-1',
    venueId: 'venue-1',
    isActive: true,
    openTime: '08:00',
    closeTime: '20:00',
    slotDurationMinutes: 60,
    pricePerHour: 100000,
  };
  const ACTIVE_VENUE = { id: 'venue-1', status: VenueStatus.ACTIVE };

  it('creates a booking with one booking_slots row per unit slot', async () => {
    const { service, courtsService, venuesService, dataSource } =
      await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);
    const manager = buildMockManager();
    dataSource.transaction.mockImplementation((cb) => cb(manager));

    const result = await service.create('customer-1', {
      courtId: 'court-1',
      date: '2026-08-25',
      startTime: '08:00',
      endTime: '10:00',
    });

    expect(result.totalPrice).toBe(200000);
    expect(result.status).toBe(BookingStatus.CONFIRMED);
    const slotSaveCall = manager.save.mock.calls.find((call) =>
      Array.isArray(call[0]),
    );
    expect(slotSaveCall![0]).toHaveLength(2);
    expect(slotSaveCall![0].map((s: { slotStart: string }) => s.slotStart)).toEqual([
      '08:00',
      '09:00',
    ]);
  });

  it('throws ConflictException when a slot is already taken', async () => {
    const { service, courtsService, venuesService, dataSource } =
      await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);
    const uniqueViolation = Object.assign(
      new QueryFailedError('INSERT', [], new Error('dup')),
      { code: '23505' },
    );
    dataSource.transaction.mockRejectedValue(uniqueViolation);

    await expect(
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:00',
        endTime: '09:00',
      }),
    ).rejects.toThrow('Một hoặc nhiều khung giờ đã được đặt');
  });

  it('throws BadRequestException for a date in the past', async () => {
    const { service } = await buildTestingModule();

    await expect(
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-01',
        startTime: '08:00',
        endTime: '09:00',
      }),
    ).rejects.toThrow('Không thể đặt sân cho ngày trong quá khứ');
  });

  it('throws BadRequestException when the time range is not aligned to the slot grid', async () => {
    const { service, courtsService, venuesService } = await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);

    await expect(
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:30',
        endTime: '09:30',
      }),
    ).rejects.toThrow(
      'Khung giờ đặt không hợp lệ hoặc không thẳng hàng với slot của sân',
    );
  });

  it('throws NotFoundException when the court is inactive', async () => {
    const { service, courtsService, venuesService } = await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue({
      ...ACTIVE_COURT,
      isActive: false,
    });
    venuesService.findByIdOrThrow.mockResolvedValue(ACTIVE_VENUE);

    await expect(
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:00',
        endTime: '09:00',
      }),
    ).rejects.toThrow('Court court-1 không tồn tại');
  });

  it('throws NotFoundException when the venue is not active', async () => {
    const { service, courtsService, venuesService } = await buildTestingModule();
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    venuesService.findByIdOrThrow.mockResolvedValue({
      id: 'venue-1',
      status: VenueStatus.PENDING_APPROVAL,
    });

    await expect(
      service.create('customer-1', {
        courtId: 'court-1',
        date: '2026-08-25',
        startTime: '08:00',
        endTime: '09:00',
      }),
    ).rejects.toThrow('Court court-1 không tồn tại');
  });
});
