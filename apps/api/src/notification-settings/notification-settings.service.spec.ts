import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationSettings } from './entities/notification-settings.entity';

const mockRepository = () => ({
  findOne: jest.fn(),
  create: jest.fn((data: unknown) => ({ ...(data as object) })),
  save: jest.fn((data: unknown) => Promise.resolve(data)),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      NotificationSettingsService,
      { provide: getRepositoryToken(NotificationSettings), useFactory: mockRepository },
    ],
  }).compile();

  return {
    service: module.get(NotificationSettingsService),
    repo: module.get(getRepositoryToken(NotificationSettings)) as ReturnType<typeof mockRepository>,
  };
}

describe('NotificationSettingsService.getForOwner', () => {
  it('returns all-true defaults when the owner has no row yet', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue(null);

    const result = await service.getForOwner('owner-1');

    expect(result).toEqual({
      newBooking: true,
      cancellation: true,
      payment: true,
      dailyReport: true,
    });
  });

  it('returns the saved row values when one exists', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({
      ownerId: 'owner-1',
      newBooking: false,
      cancellation: true,
      payment: true,
      dailyReport: false,
    });

    const result = await service.getForOwner('owner-1');

    expect(result).toEqual({
      newBooking: false,
      cancellation: true,
      payment: true,
      dailyReport: false,
    });
  });
});

describe('NotificationSettingsService.update', () => {
  it('creates a row with defaults merged with the patch on first update', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue(null);

    const result = await service.update('owner-1', { newBooking: false });

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'owner-1', newBooking: true }),
    );
    expect(result.newBooking).toBe(false);
    expect(result.cancellation).toBe(true);
  });

  it('only updates fields present in the patch on an existing row', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({
      ownerId: 'owner-1',
      newBooking: true,
      cancellation: true,
      payment: true,
      dailyReport: true,
    });

    const result = await service.update('owner-1', { payment: false });

    expect(result).toEqual({
      newBooking: true,
      cancellation: true,
      payment: false,
      dailyReport: true,
    });
  });
});
