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
});

const mockCourtsService = () => ({ findByIdOrThrow: jest.fn() });
const mockVenuesService = () => ({ getOwnedVenueOrThrow: jest.fn() });
const mockCustomerContactsService = () => ({ resolveSelector: jest.fn() });
const mockBookingsService = () => ({
  createBookingRecord: jest.fn(),
  cancelFutureOccurrences: jest.fn(),
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
