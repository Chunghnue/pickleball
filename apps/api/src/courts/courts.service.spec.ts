import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CourtsService } from './courts.service';
import { Court } from './entities/court.entity';
import { VenuesService } from './venues.service';

const mockCourtsRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
});

const mockVenuesService = () => ({
  getOwnedVenueOrThrow: jest.fn(),
  findPublicById: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CourtsService,
      { provide: getRepositoryToken(Court), useFactory: mockCourtsRepository },
      { provide: VenuesService, useFactory: mockVenuesService },
    ],
  }).compile();

  return {
    service: module.get(CourtsService),
    courtsRepo: module.get(getRepositoryToken(Court)) as ReturnType<
      typeof mockCourtsRepository
    >,
    venuesService: module.get(VenuesService) as ReturnType<
      typeof mockVenuesService
    >,
  };
}

describe('CourtsService.create', () => {
  it('creates a court on an owned venue', async () => {
    const { service, courtsRepo, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsRepo.create.mockImplementation((data) => data);
    courtsRepo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'court-1', ...data }),
    );

    const result = await service.create('owner-1', 'venue-1', {
      name: 'Sân 1',
      pricePerHour: 100000,
      openTime: '08:00',
      closeTime: '20:00',
      slotDurationMinutes: 60,
    });

    expect(venuesService.getOwnedVenueOrThrow).toHaveBeenCalledWith(
      'owner-1',
      'venue-1',
    );
    expect(result.venueId).toBe('venue-1');
    expect(result.isActive).toBe(true);
  });

  it('rejects when openTime is not before closeTime', async () => {
    const { service, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });

    await expect(
      service.create('owner-1', 'venue-1', {
        name: 'Sân 1',
        pricePerHour: 100000,
        openTime: '20:00',
        closeTime: '08:00',
        slotDurationMinutes: 60,
      }),
    ).rejects.toThrow('openTime phải trước closeTime');
  });
});

describe('CourtsService.update', () => {
  it('merges partial updates and re-validates open/close order', async () => {
    const { service, courtsRepo, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsRepo.findOne.mockResolvedValue({
      id: 'court-1',
      venueId: 'venue-1',
      name: 'Sân 1',
      pricePerHour: 100000,
      openTime: '08:00',
      closeTime: '20:00',
      slotDurationMinutes: 60,
      isActive: true,
    });
    courtsRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'venue-1', 'court-1', {
      closeTime: '22:00',
    });

    expect(result.closeTime).toBe('22:00');
    expect(result.openTime).toBe('08:00');
  });

  it('throws NotFoundException when the court does not belong to the venue', async () => {
    const { service, courtsRepo, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.update('owner-1', 'venue-1', 'court-1', { name: 'X' }),
    ).rejects.toThrow('Court court-1 không tồn tại');
  });
});

describe('CourtsService.findActiveByVenue', () => {
  it('queries only active courts for the venue', async () => {
    const { service, courtsRepo } = await buildTestingModule();
    courtsRepo.find.mockResolvedValue([{ id: 'court-1' }]);

    const result = await service.findActiveByVenue('venue-1');

    expect(courtsRepo.find).toHaveBeenCalledWith({
      where: { venueId: 'venue-1', isActive: true },
    });
    expect(result).toEqual([{ id: 'court-1' }]);
  });
});

describe('CourtsService.findByIdOrThrow', () => {
  it('returns the court regardless of active status', async () => {
    const { service, courtsRepo } = await buildTestingModule();
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', isActive: false });

    const result = await service.findByIdOrThrow('court-1');

    expect(result.id).toBe('court-1');
  });

  it('throws NotFoundException when the court does not exist', async () => {
    const { service, courtsRepo } = await buildTestingModule();
    courtsRepo.findOne.mockResolvedValue(null);

    await expect(service.findByIdOrThrow('court-1')).rejects.toThrow(
      'Court court-1 không tồn tại',
    );
  });
});

describe('CourtsService.getSlotsForDate', () => {
  const FIXED_TODAY = new Date('2026-08-24T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_TODAY);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns generated slots for an active court on an active venue', async () => {
    const { service, courtsRepo, venuesService } = await buildTestingModule();
    courtsRepo.findOne.mockResolvedValue({
      id: 'court-1',
      venueId: 'venue-1',
      openTime: '08:00',
      closeTime: '10:00',
      slotDurationMinutes: 60,
      pricePerHour: 100000,
      isActive: true,
    });
    venuesService.findPublicById.mockResolvedValue({ id: 'venue-1' });

    const result = await service.getSlotsForDate('court-1', '2026-08-25');

    expect(result).toEqual([
      { start: '08:00', end: '09:00', price: 100000 },
      { start: '09:00', end: '10:00', price: 100000 },
    ]);
  });

  it('rejects a malformed date', async () => {
    const { service } = await buildTestingModule();

    await expect(
      service.getSlotsForDate('court-1', '25-08-2026'),
    ).rejects.toThrow('date phải theo định dạng YYYY-MM-DD');
  });

  it('rejects a date in the past', async () => {
    const { service } = await buildTestingModule();

    await expect(
      service.getSlotsForDate('court-1', '2026-08-01'),
    ).rejects.toThrow('Không thể xem khung giờ của ngày trong quá khứ');
  });

  it('throws NotFoundException when the court is missing or inactive', async () => {
    const { service, courtsRepo } = await buildTestingModule();
    courtsRepo.findOne.mockResolvedValue(null);

    await expect(
      service.getSlotsForDate('court-1', '2026-08-25'),
    ).rejects.toThrow('Court court-1 không tồn tại');
  });

  it('propagates NotFoundException when the venue is not active', async () => {
    const { service, courtsRepo, venuesService } = await buildTestingModule();
    courtsRepo.findOne.mockResolvedValue({
      id: 'court-1',
      venueId: 'venue-1',
      openTime: '08:00',
      closeTime: '10:00',
      slotDurationMinutes: 60,
      pricePerHour: 100000,
      isActive: true,
    });
    venuesService.findPublicById.mockRejectedValue(
      new Error('Venue venue-1 không tồn tại'),
    );

    await expect(
      service.getSlotsForDate('court-1', '2026-08-25'),
    ).rejects.toThrow('Venue venue-1 không tồn tại');
  });
});
