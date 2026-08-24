import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { VenuesService } from './venues.service';
import { Venue, VenueStatus } from './entities/venue.entity';
import { VenueImage } from './entities/venue-image.entity';

const mockVenuesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
});

const mockVenueImagesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
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
  };
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
  it('approveVenue activates a pending venue', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      status: VenueStatus.PENDING_APPROVAL,
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.approveVenue('venue-1');

    expect(result.status).toBe(VenueStatus.ACTIVE);
  });

  it('approveVenue rejects a venue that is not pending approval', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      status: VenueStatus.ACTIVE,
    });

    await expect(service.approveVenue('venue-1')).rejects.toThrow();
  });

  it('rejectVenue marks a pending venue as rejected', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue({
      id: 'venue-1',
      status: VenueStatus.PENDING_APPROVAL,
    });
    venuesRepo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.rejectVenue('venue-1');

    expect(result.status).toBe(VenueStatus.REJECTED);
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

describe('VenuesService public reads', () => {
  it('searchPublic without a query returns only active venues', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.find.mockResolvedValue([{ id: 'venue-1' }]);

    const result = await service.searchPublic();

    expect(venuesRepo.find).toHaveBeenCalledWith({
      where: { status: VenueStatus.ACTIVE },
    });
    expect(result).toEqual([{ id: 'venue-1' }]);
  });

  it('findPublicById throws NotFoundException for an inactive or missing venue', async () => {
    const { service, venuesRepo } = await buildTestingModule();
    venuesRepo.findOne.mockResolvedValue(null);

    await expect(service.findPublicById('venue-1')).rejects.toThrow(
      'Venue venue-1 không tồn tại',
    );
  });
});
