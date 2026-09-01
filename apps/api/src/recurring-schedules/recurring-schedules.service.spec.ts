import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConflictException } from '@nestjs/common';
import { RecurringSchedulesService } from './recurring-schedules.service';
import { RecurringSchedule, RecurringScheduleStatus } from './entities/recurring-schedule.entity';
import { CourtsService } from '../courts/courts.service';
import { VenuesService } from '../courts/venues.service';
import { CustomerContactsService } from '../customer-contacts/customer-contacts.service';
import { BookingsService } from '../bookings/bookings.service';

const mockRepository = () => ({
  create: jest.fn((data: unknown) => data),
  save: jest.fn((data: unknown) => Promise.resolve({ id: 'schedule-1', ...(data as object) })),
  findOne: jest.fn(),
  find: jest.fn(),
});

const mockCourtsService = () => ({
  findByIdOrThrow: jest.fn(),
  findByVenueForOwner: jest.fn(),
});
const mockVenuesService = () => ({ getOwnedVenueOrThrow: jest.fn() });
const mockCustomerContactsService = () => ({ resolveSelector: jest.fn() });
const mockBookingsService = () => ({
  createBookingRecord: jest.fn(),
  cancelFutureOccurrences: jest.fn(),
  findByRecurringScheduleId: jest.fn(),
  countByRecurringScheduleId: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      RecurringSchedulesService,
      { provide: getRepositoryToken(RecurringSchedule), useFactory: mockRepository },
      { provide: CourtsService, useFactory: mockCourtsService },
      { provide: VenuesService, useFactory: mockVenuesService },
      { provide: CustomerContactsService, useFactory: mockCustomerContactsService },
      { provide: BookingsService, useFactory: mockBookingsService },
    ],
  }).compile();

  return {
    service: module.get(RecurringSchedulesService),
    repo: module.get(getRepositoryToken(RecurringSchedule)) as ReturnType<typeof mockRepository>,
    courtsService: module.get(CourtsService) as ReturnType<typeof mockCourtsService>,
    venuesService: module.get(VenuesService) as ReturnType<typeof mockVenuesService>,
    customerContactsService: module.get(CustomerContactsService) as ReturnType<
      typeof mockCustomerContactsService
    >,
    bookingsService: module.get(BookingsService) as ReturnType<typeof mockBookingsService>,
  };
}

describe('RecurringSchedulesService.create', () => {
  const ACTIVE_COURT = { id: 'court-1', venueId: 'venue-1' };

  it('creates the schedule and one booking occurrence per matching day, applying the discount', async () => {
    const { service, courtsService, venuesService, customerContactsService, bookingsService } =
      await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    customerContactsService.resolveSelector.mockResolvedValue({ customerContactId: 'contact-1' });
    bookingsService.createBookingRecord.mockResolvedValue({});

    const result = await service.create('owner-1', 'venue-1', {
      courtId: 'court-1',
      dayOfWeek: 0,
      startTime: '18:00',
      endTime: '19:00',
      pricePerSession: 100000,
      discountPercent: 10,
      validFrom: '2024-01-01',
      validTo: '2024-01-14',
      newCustomer: { fullName: 'Khách quen', phone: '0933333333' },
    });

    expect(bookingsService.createBookingRecord).toHaveBeenCalledTimes(2);
    expect(bookingsService.createBookingRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        courtId: 'court-1',
        date: '2024-01-01',
        startTime: '18:00',
        endTime: '19:00',
        customerContactId: 'contact-1',
        recurringScheduleId: 'schedule-1',
        totalPriceOverride: 90000,
      }),
    );
    expect(result).toEqual({
      schedule: expect.objectContaining({ id: 'schedule-1' }),
      generatedCount: 2,
      conflictingDates: [],
    });
  });

  it('collects conflicting dates instead of aborting the whole batch', async () => {
    const { service, courtsService, venuesService, customerContactsService, bookingsService } =
      await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    customerContactsService.resolveSelector.mockResolvedValue({ customerContactId: 'contact-1' });
    bookingsService.createBookingRecord
      .mockRejectedValueOnce(new ConflictException('Một hoặc nhiều khung giờ đã được đặt'))
      .mockResolvedValueOnce({});

    const result = await service.create('owner-1', 'venue-1', {
      courtId: 'court-1',
      dayOfWeek: 0,
      startTime: '18:00',
      endTime: '19:00',
      pricePerSession: 100000,
      validFrom: '2024-01-01',
      validTo: '2024-01-14',
      customerContactId: 'contact-1',
    });

    expect(result.generatedCount).toBe(1);
    expect(result.conflictingDates).toEqual(['2024-01-01']);
  });

  it('throws BadRequestException when the range exceeds 12 months', async () => {
    const { service, courtsService, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);

    await expect(
      service.create('owner-1', 'venue-1', {
        courtId: 'court-1',
        dayOfWeek: 0,
        startTime: '18:00',
        endTime: '19:00',
        pricePerSession: 100000,
        validFrom: '2024-01-01',
        validTo: '2025-06-01',
        customerContactId: 'contact-1',
      }),
    ).rejects.toThrow('Khoảng thời gian lịch cố định tối đa 12 tháng');
  });

  it('throws NotFoundException when the court does not belong to the venue', async () => {
    const { service, courtsService, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsService.findByIdOrThrow.mockResolvedValue({ id: 'court-1', venueId: 'other-venue' });

    await expect(
      service.create('owner-1', 'venue-1', {
        courtId: 'court-1',
        dayOfWeek: 0,
        startTime: '18:00',
        endTime: '19:00',
        pricePerSession: 100000,
        validFrom: '2024-01-01',
        validTo: '2024-01-14',
        customerContactId: 'contact-1',
      }),
    ).rejects.toThrow('Court court-1 không tồn tại');
  });
});

describe('RecurringSchedulesService.create autoRenew', () => {
  const ACTIVE_COURT = { id: 'court-1', venueId: 'venue-1' };

  it('defaults autoRenew to false, and persists true when provided', async () => {
    const { service, courtsService, venuesService, customerContactsService, bookingsService } =
      await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsService.findByIdOrThrow.mockResolvedValue(ACTIVE_COURT);
    customerContactsService.resolveSelector.mockResolvedValue({ customerContactId: 'contact-1' });
    bookingsService.createBookingRecord.mockResolvedValue({});

    const defaultResult = await service.create('owner-1', 'venue-1', {
      courtId: 'court-1',
      dayOfWeek: 0,
      startTime: '18:00',
      endTime: '19:00',
      pricePerSession: 100000,
      validFrom: '2024-01-01',
      validTo: '2024-01-14',
      customerContactId: 'contact-1',
    });
    expect(defaultResult.schedule.autoRenew).toBe(false);

    const explicitResult = await service.create('owner-1', 'venue-1', {
      courtId: 'court-1',
      dayOfWeek: 0,
      startTime: '18:00',
      endTime: '19:00',
      pricePerSession: 100000,
      validFrom: '2024-01-01',
      validTo: '2024-01-14',
      customerContactId: 'contact-1',
      autoRenew: true,
    });
    expect(explicitResult.schedule.autoRenew).toBe(true);
  });
});

describe('RecurringSchedulesService.cancel', () => {
  it('marks the schedule cancelled and cancels its future occurrences', async () => {
    const { service, repo, courtsService, venuesService, bookingsService } =
      await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    repo.findOne.mockResolvedValue({
      id: 'schedule-1',
      courtId: 'court-1',
      status: RecurringScheduleStatus.ACTIVE,
    });
    courtsService.findByIdOrThrow.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });

    const result = await service.cancel('owner-1', 'venue-1', 'schedule-1');

    expect(result.status).toBe(RecurringScheduleStatus.CANCELLED);
    expect(bookingsService.cancelFutureOccurrences).toHaveBeenCalledWith('schedule-1', 'owner-1');
  });

  it('throws BadRequestException when the schedule is already cancelled', async () => {
    const { service, repo, courtsService, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    repo.findOne.mockResolvedValue({
      id: 'schedule-1',
      courtId: 'court-1',
      status: RecurringScheduleStatus.CANCELLED,
    });
    courtsService.findByIdOrThrow.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });

    await expect(service.cancel('owner-1', 'venue-1', 'schedule-1')).rejects.toThrow(
      'Lịch cố định đã bị huỷ',
    );
  });
});

describe('RecurringSchedulesService.findByVenueForOwner', () => {
  it('lists schedules for the venue courts with their occurrence count', async () => {
    const { service, repo, courtsService, bookingsService } = await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([{ id: 'court-1' }, { id: 'court-2' }]);
    repo.find.mockResolvedValue([
      { id: 'schedule-1', courtId: 'court-1', status: RecurringScheduleStatus.ACTIVE },
    ]);
    bookingsService.countByRecurringScheduleId.mockResolvedValue(5);

    const result = await service.findByVenueForOwner('owner-1', 'venue-1');

    expect(courtsService.findByVenueForOwner).toHaveBeenCalledWith('owner-1', 'venue-1');
    expect(result).toEqual([
      expect.objectContaining({ id: 'schedule-1', occurrenceCount: 5 }),
    ]);
  });

  it('returns an empty list when the venue has no courts', async () => {
    const { service, courtsService, repo } = await buildTestingModule();
    courtsService.findByVenueForOwner.mockResolvedValue([]);
    repo.find.mockResolvedValue([]);

    const result = await service.findByVenueForOwner('owner-1', 'venue-1');

    expect(result).toEqual([]);
  });
});

describe('RecurringSchedulesService.findByIdForOwner', () => {
  it('returns the schedule with its occurrences', async () => {
    const { service, repo, courtsService, venuesService, bookingsService } =
      await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    repo.findOne.mockResolvedValue({ id: 'schedule-1', courtId: 'court-1' });
    courtsService.findByIdOrThrow.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });
    bookingsService.findByRecurringScheduleId.mockResolvedValue([{ id: 'booking-1' }]);

    const result = await service.findByIdForOwner('owner-1', 'venue-1', 'schedule-1');

    expect(result).toEqual({
      schedule: { id: 'schedule-1', courtId: 'court-1' },
      occurrences: [{ id: 'booking-1' }],
    });
  });

  it('throws NotFoundException when the schedule does not belong to the venue', async () => {
    const { service, repo, courtsService, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    repo.findOne.mockResolvedValue({ id: 'schedule-1', courtId: 'court-1' });
    courtsService.findByIdOrThrow.mockResolvedValue({ id: 'court-1', venueId: 'other-venue' });

    await expect(service.findByIdForOwner('owner-1', 'venue-1', 'schedule-1')).rejects.toThrow(
      'Lịch cố định schedule-1 không tồn tại',
    );
  });
});

describe('RecurringSchedulesService.renewSchedule', () => {
  const DUE_SCHEDULE = {
    id: 'schedule-1',
    courtId: 'court-1',
    customerId: null,
    customerContactId: 'contact-1',
    dayOfWeek: 0, // Monday
    startTime: '18:00',
    endTime: '19:00',
    pricePerSession: 100000,
    discountPercent: 10,
    validFrom: '2098-12-01',
    validTo: '2099-01-05', // a Monday
    autoRenew: true,
    status: RecurringScheduleStatus.ACTIVE,
  } as RecurringSchedule;

  it('generates occurrences for the next 30 days past validTo and extends validTo', async () => {
    const { service, repo, bookingsService } = await buildTestingModule();
    bookingsService.createBookingRecord.mockResolvedValue({});
    repo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.renewSchedule({ ...DUE_SCHEDULE });

    // 2099-01-06 .. 2099-02-04 (30 days after old validTo) contains Mondays
    // 2099-01-12, 01-19, 01-26, 02-02 -> 4 occurrences
    expect(result.generatedCount).toBe(4);
    expect(result.conflictingDates).toEqual([]);
    expect(bookingsService.createBookingRecord).toHaveBeenCalledWith(
      expect.objectContaining({
        courtId: 'court-1',
        date: '2099-01-12',
        startTime: '18:00',
        endTime: '19:00',
        customerContactId: 'contact-1',
        recurringScheduleId: 'schedule-1',
        totalPriceOverride: 90000,
      }),
    );
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ validTo: '2099-02-04' }),
    );
  });

  it('collects conflicting dates instead of aborting', async () => {
    const { service, repo, bookingsService } = await buildTestingModule();
    bookingsService.createBookingRecord
      .mockRejectedValueOnce(new ConflictException('Một hoặc nhiều khung giờ đã được đặt'))
      .mockResolvedValue({});
    repo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.renewSchedule({ ...DUE_SCHEDULE });

    expect(result.conflictingDates).toEqual(['2099-01-12']);
    expect(result.generatedCount).toBe(3);
  });
});

describe('RecurringSchedulesService.renewExpiringSchedules', () => {
  it('renews every active, auto-renewing schedule due within 7 days', async () => {
    const { service, repo, bookingsService } = await buildTestingModule();
    const due = {
      id: 'schedule-1',
      courtId: 'court-1',
      customerId: null,
      customerContactId: 'contact-1',
      dayOfWeek: 0,
      startTime: '18:00',
      endTime: '19:00',
      pricePerSession: 100000,
      discountPercent: null,
      validFrom: '2098-12-01',
      validTo: '2099-01-05',
      autoRenew: true,
      status: RecurringScheduleStatus.ACTIVE,
    } as RecurringSchedule;
    repo.find.mockResolvedValue([due]);
    repo.save.mockImplementation((data) => Promise.resolve(data));
    bookingsService.createBookingRecord.mockResolvedValue({});

    await service.renewExpiringSchedules();

    expect(repo.find).toHaveBeenCalledWith({
      where: {
        status: RecurringScheduleStatus.ACTIVE,
        autoRenew: true,
        validTo: expect.anything(),
      },
    });
    expect(bookingsService.createBookingRecord).toHaveBeenCalled();
    expect(repo.save).toHaveBeenCalledWith(expect.objectContaining({ validTo: '2099-02-04' }));
  });
});
