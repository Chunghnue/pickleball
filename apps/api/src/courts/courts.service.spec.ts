import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CourtsService } from './courts.service';
import { Court, CourtStatus } from './entities/court.entity';
import { CourtImage } from './entities/court-image.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { VenuesService } from './venues.service';

const mockCourtsRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  remove: jest.fn(),
});

const mockCourtImagesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
  remove: jest.fn(),
  delete: jest.fn(),
});

const mockBookingsRepository = () => ({
  count: jest.fn(),
});

const mockVenuesService = () => ({
  getOwnedVenueOrThrow: jest.fn(),
  findPublicById: jest.fn(),
  findMineByOwner: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CourtsService,
      { provide: getRepositoryToken(Court), useFactory: mockCourtsRepository },
      {
        provide: getRepositoryToken(CourtImage),
        useFactory: mockCourtImagesRepository,
      },
      {
        provide: getRepositoryToken(Booking),
        useFactory: mockBookingsRepository,
      },
      { provide: VenuesService, useFactory: mockVenuesService },
    ],
  }).compile();

  return {
    service: module.get(CourtsService),
    courtsRepo: module.get(getRepositoryToken(Court)) as ReturnType<
      typeof mockCourtsRepository
    >,
    courtImagesRepo: module.get(getRepositoryToken(CourtImage)) as ReturnType<
      typeof mockCourtImagesRepository
    >,
    bookingsRepo: module.get(getRepositoryToken(Booking)) as ReturnType<
      typeof mockBookingsRepository
    >,
    venuesService: module.get(VenuesService) as ReturnType<
      typeof mockVenuesService
    >,
  };
}

describe('CourtsService.create', () => {
  it('creates a court on an owned venue with status active and default fields', async () => {
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
    expect(result.status).toBe(CourtStatus.ACTIVE);
    expect(result.displayOrder).toBe(0);
    expect(result.description).toBeNull();
    expect(result.capacity).toBeNull();
  });

  it('accepts optional description/capacity/displayOrder', async () => {
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
      description: 'Sân ngoài trời',
      capacity: 8,
      displayOrder: 2,
    });

    expect(result.description).toBe('Sân ngoài trời');
    expect(result.capacity).toBe(8);
    expect(result.displayOrder).toBe(2);
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
      status: CourtStatus.ACTIVE,
      description: null,
      capacity: null,
      displayOrder: 0,
    });
    courtsRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'venue-1', 'court-1', {
      closeTime: '22:00',
    });

    expect(result.closeTime).toBe('22:00');
    expect(result.openTime).toBe('08:00');
  });

  it('updates status/description/capacity/displayOrder when provided', async () => {
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
      status: CourtStatus.ACTIVE,
      description: null,
      capacity: null,
      displayOrder: 0,
    });
    courtsRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.update('owner-1', 'venue-1', 'court-1', {
      status: CourtStatus.MAINTENANCE,
      description: 'Đang thay lưới',
      capacity: 6,
      displayOrder: 5,
    });

    expect(result.status).toBe(CourtStatus.MAINTENANCE);
    expect(result.description).toBe('Đang thay lưới');
    expect(result.capacity).toBe(6);
    expect(result.displayOrder).toBe(5);
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
  it('queries only courts with status active for the venue', async () => {
    const { service, courtsRepo } = await buildTestingModule();
    courtsRepo.find.mockResolvedValue([{ id: 'court-1' }]);

    const result = await service.findActiveByVenue('venue-1');

    expect(courtsRepo.find).toHaveBeenCalledWith({
      where: { venueId: 'venue-1', status: CourtStatus.ACTIVE },
    });
    expect(result).toEqual([{ id: 'court-1' }]);
  });
});

describe('CourtsService.findByIdOrThrow', () => {
  it('returns the court regardless of status', async () => {
    const { service, courtsRepo } = await buildTestingModule();
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', status: CourtStatus.CLOSED });

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
      status: CourtStatus.ACTIVE,
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

  it('throws NotFoundException when the court is missing or not active', async () => {
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
      status: CourtStatus.ACTIVE,
    });
    venuesService.findPublicById.mockRejectedValue(
      new Error('Venue venue-1 không tồn tại'),
    );

    await expect(
      service.getSlotsForDate('court-1', '2026-08-25'),
    ).rejects.toThrow('Venue venue-1 không tồn tại');
  });
});

describe('CourtsService.findAllForOwner', () => {
  it('returns courts across all of the owner venues with venueName and images attached', async () => {
    const { service, courtsRepo, courtImagesRepo, venuesService } = await buildTestingModule();
    venuesService.findMineByOwner.mockResolvedValue([
      { id: 'venue-1', name: 'Chi nhánh A' },
      { id: 'venue-2', name: 'Chi nhánh B' },
    ]);
    courtsRepo.find.mockResolvedValue([
      { id: 'court-1', venueId: 'venue-1', name: 'Sân 1' },
      { id: 'court-2', venueId: 'venue-2', name: 'Sân 2' },
    ]);
    courtImagesRepo.find.mockResolvedValue([
      { id: 'image-1', courtId: 'court-1', url: '/uploads/courts/court-1/a.jpg' },
    ]);

    const result = await service.findAllForOwner('owner-1');

    expect(result).toEqual([
      {
        id: 'court-1',
        venueId: 'venue-1',
        name: 'Sân 1',
        venueName: 'Chi nhánh A',
        images: [{ id: 'image-1', courtId: 'court-1', url: '/uploads/courts/court-1/a.jpg' }],
      },
      { id: 'court-2', venueId: 'venue-2', name: 'Sân 2', venueName: 'Chi nhánh B', images: [] },
    ]);
  });

  it('returns an empty array when the owner has no venues, without querying courts', async () => {
    const { service, courtsRepo, venuesService } = await buildTestingModule();
    venuesService.findMineByOwner.mockResolvedValue([]);

    const result = await service.findAllForOwner('owner-1');

    expect(result).toEqual([]);
    expect(courtsRepo.find).not.toHaveBeenCalled();
  });
});

describe('CourtsService.remove', () => {
  it('deletes the court and its images when it has no booking history', async () => {
    const { service, courtsRepo, courtImagesRepo, bookingsRepo, venuesService } =
      await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });
    bookingsRepo.count.mockResolvedValue(0);

    await service.remove('owner-1', 'venue-1', 'court-1');

    expect(courtImagesRepo.delete).toHaveBeenCalledWith({ courtId: 'court-1' });
    expect(courtsRepo.remove).toHaveBeenCalledWith({ id: 'court-1', venueId: 'venue-1' });
  });

  it('throws ConflictException when the court has booking history', async () => {
    const { service, courtsRepo, bookingsRepo, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });
    bookingsRepo.count.mockResolvedValue(3);

    await expect(service.remove('owner-1', 'venue-1', 'court-1')).rejects.toThrow(
      'Sân đã có lịch sử đặt sân, hãy chuyển sang trạng thái Tạm đóng thay vì xóa',
    );
  });

  it('throws NotFoundException when the court does not belong to the venue', async () => {
    const { service, courtsRepo, venuesService } = await buildTestingModule();
    venuesService.getOwnedVenueOrThrow.mockResolvedValue({ id: 'venue-1' });
    courtsRepo.findOne.mockResolvedValue(null);

    await expect(service.remove('owner-1', 'venue-1', 'court-1')).rejects.toThrow(
      'Court court-1 không tồn tại',
    );
  });
});
