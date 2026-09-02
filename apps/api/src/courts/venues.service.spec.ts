import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { VenuesService } from './venues.service';
import { Venue, VenueStatus } from './entities/venue.entity';
import { VenueImage } from './entities/venue-image.entity';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

const mockVenuesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  count: jest.fn(),
});

const mockVenueImagesRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  remove: jest.fn(),
  find: jest.fn(),
});

const mockUsersService = () => ({
  findById: jest.fn(),
});

const mockNotificationsService = () => ({
  notifyVenueApproved: jest.fn().mockResolvedValue(undefined),
  notifyVenueRejected: jest.fn().mockResolvedValue(undefined),
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
      { provide: UsersService, useFactory: mockUsersService },
      { provide: NotificationsService, useFactory: mockNotificationsService },
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
    usersService: module.get(UsersService) as ReturnType<
      typeof mockUsersService
    >,
    notificationsService: module.get(NotificationsService) as ReturnType<
      typeof mockNotificationsService
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
