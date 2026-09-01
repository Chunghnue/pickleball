import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PricingRule } from './entities/pricing-rule.entity';
import { Court } from '../courts/entities/court.entity';
import { Venue } from '../courts/entities/venue.entity';
import { CreatePricingRuleDto } from './dto/create-pricing-rule.dto';
import { UpdatePricingRuleDto } from './dto/update-pricing-rule.dto';
import { RecurringSchedule, RecurringScheduleStatus } from '../recurring-schedules/entities/recurring-schedule.entity';

const mockPricingRulesRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  count: jest.fn(),
});

const mockCourtsRepository = () => ({
  findOne: jest.fn(),
  find: jest.fn(),
});

const mockVenuesRepository = () => ({
  find: jest.fn(),
  findOne: jest.fn(),
});

const mockRecurringSchedulesRepository = () => ({
  find: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      PricingService,
      { provide: getRepositoryToken(PricingRule), useFactory: mockPricingRulesRepository },
      { provide: getRepositoryToken(Court), useFactory: mockCourtsRepository },
      { provide: getRepositoryToken(Venue), useFactory: mockVenuesRepository },
      {
        provide: getRepositoryToken(RecurringSchedule),
        useFactory: mockRecurringSchedulesRepository,
      },
    ],
  }).compile();

  return {
    service: module.get(PricingService),
    pricingRulesRepo: module.get(getRepositoryToken(PricingRule)) as ReturnType<
      typeof mockPricingRulesRepository
    >,
    courtsRepo: module.get(getRepositoryToken(Court)) as ReturnType<typeof mockCourtsRepository>,
    venuesRepo: module.get(getRepositoryToken(Venue)) as ReturnType<typeof mockVenuesRepository>,
    recurringSchedulesRepo: module.get(getRepositoryToken(RecurringSchedule)) as ReturnType<
      typeof mockRecurringSchedulesRepository
    >,
  };
}

function rule(overrides: Partial<PricingRule>): PricingRule {
  return {
    id: 'rule-1',
    courtId: 'court-1',
    name: 'Rule',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startTime: '00:00',
    endTime: '23:59',
    price: 100000,
    priority: 0,
    advanceBookingHours: null,
    advancePrice: null,
    validFrom: null,
    validTo: null,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    ...overrides,
  } as PricingRule;
}

describe('PricingService.resolvePrice', () => {
  const FIXED_NOW = new Date('2026-08-24T12:00:00Z');

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(FIXED_NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('falls back to court.pricePerHour when no rule matches', async () => {
    const { service, pricingRulesRepo, courtsRepo } = await buildTestingModule();
    pricingRulesRepo.find.mockResolvedValue([]);
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', pricePerHour: 90000 });

    const price = await service.resolvePrice('court-1', '2026-08-25', '18:00');

    expect(price).toBe(90000);
  });

  it('filters out rules on the wrong day of week', async () => {
    // 2026-08-25 is a Tuesday -> spec day-of-week index 1 (0=Mon..6=Sun)
    const { service, pricingRulesRepo, courtsRepo } = await buildTestingModule();
    pricingRulesRepo.find.mockResolvedValue([rule({ daysOfWeek: [5, 6], price: 150000 })]);
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', pricePerHour: 90000 });

    const price = await service.resolvePrice('court-1', '2026-08-25', '18:00');

    expect(price).toBe(90000);
  });

  it('filters out rules outside the time window', async () => {
    const { service, pricingRulesRepo, courtsRepo } = await buildTestingModule();
    pricingRulesRepo.find.mockResolvedValue([
      rule({ startTime: '17:00', endTime: '22:00', price: 150000 }),
    ]);
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', pricePerHour: 90000 });

    const price = await service.resolvePrice('court-1', '2026-08-25', '08:00');

    expect(price).toBe(90000);
  });

  it('filters out rules outside validFrom/validTo', async () => {
    const { service, pricingRulesRepo, courtsRepo } = await buildTestingModule();
    pricingRulesRepo.find.mockResolvedValue([
      rule({ validFrom: '2026-09-01', validTo: null, price: 150000 }),
    ]);
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', pricePerHour: 90000 });

    const price = await service.resolvePrice('court-1', '2026-08-25', '18:00');

    expect(price).toBe(90000);
  });

  it('picks the highest-priority matching rule', async () => {
    const { service, pricingRulesRepo } = await buildTestingModule();
    pricingRulesRepo.find.mockResolvedValue([
      rule({ id: 'low', priority: 1, price: 100000 }),
      rule({ id: 'high', priority: 5, price: 200000 }),
    ]);

    const price = await service.resolvePrice('court-1', '2026-08-25', '18:00');

    expect(price).toBe(200000);
  });

  it('breaks a priority tie with the newer rule (later createdAt)', async () => {
    const { service, pricingRulesRepo } = await buildTestingModule();
    pricingRulesRepo.find.mockResolvedValue([
      rule({
        id: 'older',
        priority: 3,
        price: 100000,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      }),
      rule({
        id: 'newer',
        priority: 3,
        price: 120000,
        createdAt: new Date('2026-02-01T00:00:00Z'),
      }),
    ]);

    const price = await service.resolvePrice('court-1', '2026-08-25', '18:00');

    expect(price).toBe(120000);
  });

  it('applies advancePrice when booked at least advanceBookingHours ahead', async () => {
    const { service, pricingRulesRepo } = await buildTestingModule();
    pricingRulesRepo.find.mockResolvedValue([
      rule({ price: 100000, advanceBookingHours: 24, advancePrice: 70000 }),
    ]);

    // FIXED_NOW = 2026-08-24T12:00Z, slot = 2026-08-25T20:00Z -> 32h ahead (>= 24)
    const price = await service.resolvePrice('court-1', '2026-08-25', '20:00');

    expect(price).toBe(70000);
  });

  it('keeps the normal price when booked less than advanceBookingHours ahead', async () => {
    const { service, pricingRulesRepo } = await buildTestingModule();
    pricingRulesRepo.find.mockResolvedValue([
      rule({ price: 100000, advanceBookingHours: 48, advancePrice: 70000 }),
    ]);

    // FIXED_NOW = 2026-08-24T12:00Z, slot = 2026-08-25T20:00Z -> 32h ahead (< 48)
    const price = await service.resolvePrice('court-1', '2026-08-25', '20:00');

    expect(price).toBe(100000);
  });

  it('keeps the normal price when advancePrice is null even if the window is met', async () => {
    const { service, pricingRulesRepo } = await buildTestingModule();
    pricingRulesRepo.find.mockResolvedValue([
      rule({ price: 100000, advanceBookingHours: 1, advancePrice: null }),
    ]);

    const price = await service.resolvePrice('court-1', '2026-08-25', '20:00');

    expect(price).toBe(100000);
  });
});

const VALID_DTO: CreatePricingRuleDto = {
  name: 'Buổi tối',
  daysOfWeek: [0, 1, 2, 3, 4],
  startTime: '17:00',
  endTime: '22:00',
  price: 150000,
};

describe('PricingService.create', () => {
  it('creates a rule on an owned court', async () => {
    const { service, pricingRulesRepo, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });
    pricingRulesRepo.create.mockImplementation((data) => data);
    pricingRulesRepo.save.mockImplementation((data) => Promise.resolve({ id: 'rule-1', ...data }));

    const result = await service.create('owner-1', 'venue-1', 'court-1', VALID_DTO);

    expect(result.courtId).toBe('court-1');
    expect(result.priority).toBe(0);
    expect(result.advanceBookingHours).toBeNull();
    expect(result.advancePrice).toBeNull();
    expect(result.validFrom).toBeNull();
    expect(result.validTo).toBeNull();
  });

  it('throws ForbiddenException when the venue belongs to another owner', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'someone-else' });

    await expect(service.create('owner-1', 'venue-1', 'court-1', VALID_DTO)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('throws NotFoundException when the court does not belong to the venue', async () => {
    const { service, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue(null);

    await expect(service.create('owner-1', 'venue-1', 'court-1', VALID_DTO)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws BadRequestException when startTime is not before endTime', async () => {
    const { service, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });

    await expect(
      service.create('owner-1', 'venue-1', 'court-1', { ...VALID_DTO, startTime: '22:00', endTime: '17:00' }),
    ).rejects.toThrow('startTime phải trước endTime');
  });

  it('throws BadRequestException when validFrom is after validTo', async () => {
    const { service, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });

    await expect(
      service.create('owner-1', 'venue-1', 'court-1', {
        ...VALID_DTO,
        validFrom: '2026-09-01',
        validTo: '2026-08-01',
      }),
    ).rejects.toThrow('validFrom phải trước hoặc bằng validTo');
  });
});

describe('PricingService.findByCourt', () => {
  it('returns rules for an owned court', async () => {
    const { service, pricingRulesRepo, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });
    pricingRulesRepo.find.mockResolvedValue([rule({})]);

    const result = await service.findByCourt('owner-1', 'venue-1', 'court-1');

    expect(result).toHaveLength(1);
  });
});

describe('PricingService.update', () => {
  it('applies partial updates', async () => {
    const { service, pricingRulesRepo, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });
    const existing = rule({ price: 100000 });
    pricingRulesRepo.findOne.mockResolvedValue(existing);
    pricingRulesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const dto: UpdatePricingRuleDto = { price: 130000 };
    const result = await service.update('owner-1', 'venue-1', 'court-1', 'rule-1', dto);

    expect(result.price).toBe(130000);
    expect(result.startTime).toBe(existing.startTime);
  });

  it('throws NotFoundException when the rule does not exist on that court', async () => {
    const { service, pricingRulesRepo, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });
    pricingRulesRepo.findOne.mockResolvedValue(null);

    await expect(
      service.update('owner-1', 'venue-1', 'court-1', 'rule-1', { price: 1 }),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('PricingService.remove', () => {
  it('removes an owned rule', async () => {
    const { service, pricingRulesRepo, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });
    const existing = rule({});
    pricingRulesRepo.findOne.mockResolvedValue(existing);

    await service.remove('owner-1', 'venue-1', 'court-1', 'rule-1');

    expect(pricingRulesRepo.remove).toHaveBeenCalledWith(existing);
  });
});

describe('PricingService.copyFrom', () => {
  it('copies rules from a court the owner owns in any of their venues', async () => {
    const { service, pricingRulesRepo, courtsRepo, venuesRepo } = await buildTestingModule();
    // target court ownership check
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne
      .mockResolvedValueOnce({ id: 'court-1', venueId: 'venue-1' }) // getOwnedCourtOrThrow(target)
      .mockResolvedValueOnce({ id: 'court-2', venueId: 'venue-2' }); // source court lookup
    venuesRepo.find.mockResolvedValue([
      { id: 'venue-1', ownerId: 'owner-1' },
      { id: 'venue-2', ownerId: 'owner-1' },
    ]);
    pricingRulesRepo.find.mockResolvedValue([
      rule({ id: 'src-1', courtId: 'court-2', price: 150000 }),
    ]);
    pricingRulesRepo.create.mockImplementation((data) => data);
    pricingRulesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.copyFrom('owner-1', 'venue-1', 'court-1', 'court-2');

    expect(result).toHaveLength(1);
    expect((result[0] as unknown as { courtId: string }).courtId).toBe('court-1');
    expect((result[0] as unknown as { price: number }).price).toBe(150000);
  });

  it('throws NotFoundException when sourceCourtId is not owned by the caller', async () => {
    const { service, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne
      .mockResolvedValueOnce({ id: 'court-1', venueId: 'venue-1' }) // target ok
      .mockResolvedValueOnce(null); // source not found among owned venues
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1', ownerId: 'owner-1' }]);

    await expect(service.copyFrom('owner-1', 'venue-1', 'court-1', 'someone-elses-court')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('PricingService.copyFromVenue', () => {
  it('copies every source-venue rule onto every court of the target venue', async () => {
    const { service, pricingRulesRepo, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne
      .mockResolvedValueOnce({ id: 'venue-1', ownerId: 'owner-1' }) // target venue ownership
      .mockResolvedValueOnce({ id: 'venue-2', ownerId: 'owner-1' }); // source venue ownership
    courtsRepo.find
      .mockResolvedValueOnce([{ id: 'court-1' }, { id: 'court-2' }]) // target venue's courts
      .mockResolvedValueOnce([{ id: 'court-3' }]); // source venue's courts
    pricingRulesRepo.find.mockResolvedValue([
      rule({ id: 'src-1', courtId: 'court-3', price: 100000 }),
      rule({ id: 'src-2', courtId: 'court-3', price: 200000 }),
    ]);
    pricingRulesRepo.create.mockImplementation((data) => data);
    pricingRulesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.copyFromVenue('owner-1', 'venue-1', 'venue-2');

    expect(result).toHaveLength(4); // 2 target courts x 2 source rules
    expect(result.map((r) => (r as unknown as { courtId: string }).courtId).sort()).toEqual([
      'court-1',
      'court-1',
      'court-2',
      'court-2',
    ]);
    expect(result.map((r) => (r as unknown as { price: number }).price).sort()).toEqual([
      100000, 100000, 200000, 200000,
    ]);
  });

  it('returns an empty array without saving when the target venue has no courts', async () => {
    const { service, pricingRulesRepo, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne
      .mockResolvedValueOnce({ id: 'venue-1', ownerId: 'owner-1' })
      .mockResolvedValueOnce({ id: 'venue-2', ownerId: 'owner-1' });
    courtsRepo.find.mockResolvedValueOnce([]).mockResolvedValueOnce([{ id: 'court-3' }]);
    pricingRulesRepo.find.mockResolvedValue([rule({ id: 'src-1', courtId: 'court-3' })]);

    const result = await service.copyFromVenue('owner-1', 'venue-1', 'venue-2');

    expect(result).toEqual([]);
    expect(pricingRulesRepo.save).not.toHaveBeenCalled();
  });

  it('throws BadRequestException when copying a venue from itself', async () => {
    const { service } = await buildTestingModule();

    await expect(service.copyFromVenue('owner-1', 'venue-1', 'venue-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('throws NotFoundException when the source venue is not owned by the caller', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne
      .mockResolvedValueOnce({ id: 'venue-1', ownerId: 'owner-1' })
      .mockResolvedValueOnce({ id: 'venue-2', ownerId: 'someone-else' });

    await expect(service.copyFromVenue('owner-1', 'venue-1', 'venue-2')).rejects.toThrow(
      NotFoundException,
    );
  });
});

describe('PricingService.getSummary', () => {
  it('counts pricing rules and active schedules across every court in the venue', async () => {
    const { service, courtsRepo, venuesRepo, pricingRulesRepo, recurringSchedulesRepo } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.find.mockResolvedValue([{ id: 'court-1' }, { id: 'court-2' }]);
    pricingRulesRepo.count.mockResolvedValue(7);
    recurringSchedulesRepo.find.mockResolvedValue([
      { pricePerSession: 120000, discountPercent: null },
      { pricePerSession: 100000, discountPercent: 10 },
    ]);

    const result = await service.getSummary('owner-1', 'venue-1');

    expect(courtsRepo.find).toHaveBeenCalledWith({ where: { venueId: 'venue-1' } });
    expect(pricingRulesRepo.count).toHaveBeenCalledWith({
      where: { courtId: expect.anything() },
    });
    expect(recurringSchedulesRepo.find).toHaveBeenCalledWith({
      where: { courtId: expect.anything(), status: RecurringScheduleStatus.ACTIVE },
    });
    expect(result).toEqual({
      pricingRulesCount: 7,
      activeRecurringSchedulesCount: 2,
      // 120000*52/12 + 100000*0.9*52/12 = 520000 + 390000 = 910000
      estimatedMonthlyRecurringRevenue: 910000,
    });
  });

  it('scopes to a single court when courtId is provided', async () => {
    const { service, courtsRepo, venuesRepo, pricingRulesRepo, recurringSchedulesRepo } =
      await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue({ id: 'court-1', venueId: 'venue-1' });
    pricingRulesRepo.count.mockResolvedValue(2);
    recurringSchedulesRepo.find.mockResolvedValue([]);

    const result = await service.getSummary('owner-1', 'venue-1', 'court-1');

    expect(courtsRepo.find).not.toHaveBeenCalled();
    expect(pricingRulesRepo.count).toHaveBeenCalledWith({ where: { courtId: expect.anything() } });
    expect(result).toEqual({
      pricingRulesCount: 2,
      activeRecurringSchedulesCount: 0,
      estimatedMonthlyRecurringRevenue: 0,
    });
  });

  it('throws NotFoundException when courtId does not belong to the venue', async () => {
    const { service, courtsRepo, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'owner-1' });
    courtsRepo.findOne.mockResolvedValue(null);

    await expect(service.getSummary('owner-1', 'venue-1', 'court-x')).rejects.toThrow(
      NotFoundException,
    );
  });

  it('throws ForbiddenException when the venue belongs to another owner', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({ id: 'venue-1', ownerId: 'someone-else' });

    await expect(service.getSummary('owner-1', 'venue-1')).rejects.toThrow(ForbiddenException);
  });
});
