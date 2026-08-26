import { Test, TestingModule } from '@nestjs/testing';
import { AdminApprovalsService } from './admin-approvals.service';
import { UsersService } from '../users/users.service';
import { VenuesService } from '../courts/venues.service';
import { UserStatus } from '../users/entities/user.entity';

const mockUsersService = () => ({
  findPendingOwners: jest.fn(),
  findByIds: jest.fn(),
});

const mockVenuesService = () => ({
  findPendingVenues: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AdminApprovalsService,
      { provide: UsersService, useFactory: mockUsersService },
      { provide: VenuesService, useFactory: mockVenuesService },
    ],
  }).compile();

  return {
    service: module.get(AdminApprovalsService),
    usersService: module.get(UsersService) as ReturnType<
      typeof mockUsersService
    >,
    venuesService: module.get(VenuesService) as ReturnType<
      typeof mockVenuesService
    >,
  };
}

describe('AdminApprovalsService.findAll', () => {
  it('merges pending owners and venues, sorted by submittedAt descending', async () => {
    const { service, usersService, venuesService } = await buildTestingModule();
    usersService.findPendingOwners.mockResolvedValue([
      {
        id: 'owner-1',
        fullName: 'Owner One',
        email: 'owner-1@test.com',
        phone: null,
        createdAt: new Date('2026-08-20T00:00:00Z'),
      },
    ]);
    venuesService.findPendingVenues.mockResolvedValue([
      {
        id: 'venue-1',
        name: 'ABC Pickleball',
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        ownerId: 'owner-2',
        createdAt: new Date('2026-08-25T00:00:00Z'),
      },
    ]);
    usersService.findByIds.mockResolvedValue([
      { id: 'owner-2', fullName: 'Owner Two', status: UserStatus.ACTIVE },
    ]);

    const result = await service.findAll();

    expect(usersService.findByIds).toHaveBeenCalledWith(['owner-2']);
    expect(result).toEqual([
      {
        type: 'venue',
        id: 'venue-1',
        name: 'ABC Pickleball',
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        submittedAt: new Date('2026-08-25T00:00:00Z'),
        owner: {
          id: 'owner-2',
          fullName: 'Owner Two',
          status: UserStatus.ACTIVE,
        },
      },
      {
        type: 'owner',
        id: 'owner-1',
        fullName: 'Owner One',
        email: 'owner-1@test.com',
        phone: null,
        submittedAt: new Date('2026-08-20T00:00:00Z'),
      },
    ]);
  });

  it('reflects a pending owner status on their venue row when the owner is also pending', async () => {
    const { service, usersService, venuesService } = await buildTestingModule();
    usersService.findPendingOwners.mockResolvedValue([]);
    venuesService.findPendingVenues.mockResolvedValue([
      {
        id: 'venue-1',
        name: 'ABC Pickleball',
        address: '123 Le Loi',
        city: 'Ho Chi Minh',
        ownerId: 'owner-1',
        createdAt: new Date('2026-08-25T00:00:00Z'),
      },
    ]);
    usersService.findByIds.mockResolvedValue([
      {
        id: 'owner-1',
        fullName: 'Owner One',
        status: UserStatus.PENDING_APPROVAL,
      },
    ]);

    const result = await service.findAll();

    expect(result[0]).toMatchObject({
      type: 'venue',
      owner: {
        id: 'owner-1',
        fullName: 'Owner One',
        status: UserStatus.PENDING_APPROVAL,
      },
    });
  });

  it('returns an empty array when nothing is pending', async () => {
    const { service, usersService, venuesService } = await buildTestingModule();
    usersService.findPendingOwners.mockResolvedValue([]);
    venuesService.findPendingVenues.mockResolvedValue([]);
    usersService.findByIds.mockResolvedValue([]);

    const result = await service.findAll();

    expect(result).toEqual([]);
  });
});
