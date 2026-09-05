import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User, UserRole, UserStatus } from './entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

const mockRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
});

const mockNotificationsService = () => ({
  notifyOwnerApproved: jest.fn().mockResolvedValue(undefined),
  notifyOwnerRejected: jest.fn().mockResolvedValue(undefined),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      UsersService,
      { provide: getRepositoryToken(User), useFactory: mockRepository },
      { provide: NotificationsService, useFactory: mockNotificationsService },
    ],
  }).compile();

  return {
    service: module.get(UsersService),
    repo: module.get(getRepositoryToken(User)),
    notificationsService: module.get(NotificationsService),
  };
}

describe('UsersService', () => {
  it('hashes the password and defaults status/role fields before saving', async () => {
    const { service, repo } = await buildTestingModule();
    repo.create.mockImplementation((data) => data);
    repo.save.mockImplementation((data) =>
      Promise.resolve({ id: 'user-1', ...data }),
    );

    const result = await service.create({
      email: 'a@test.com',
      password: 'plaintext-password',
      fullName: 'A B',
      role: UserRole.CUSTOMER,
    });

    expect(result.passwordHash).toBeDefined();
    expect(result.passwordHash).not.toBe('plaintext-password');
    await expect(
      bcrypt.compare('plaintext-password', result.passwordHash),
    ).resolves.toBe(true);
    expect(result.status).toBe(UserStatus.PENDING_VERIFICATION);
    expect(result.emailVerified).toBe(false);
  });
});

describe('UsersService.markVerified', () => {
  it('sets emailVerified and the given status', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({
      id: 'user-1',
      emailVerified: false,
      status: UserStatus.PENDING_VERIFICATION,
    });
    repo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.markVerified('user-1', UserStatus.ACTIVE);

    expect(result.emailVerified).toBe(true);
    expect(result.status).toBe(UserStatus.ACTIVE);
  });
});

describe('UsersService owner approval', () => {
  it('findPendingOwners returns owners awaiting approval', async () => {
    const { service, repo } = await buildTestingModule();
    repo.find.mockResolvedValue([{ id: 'owner-1' }]);

    const result = await service.findPendingOwners();

    expect(repo.find).toHaveBeenCalledWith({
      where: { role: UserRole.OWNER, status: UserStatus.PENDING_APPROVAL },
    });
    expect(result).toEqual([{ id: 'owner-1' }]);
  });

  it('approveOwner activates a pending owner and sends an approval email', async () => {
    const { service, repo, notificationsService } = await buildTestingModule();
    repo.findOne.mockResolvedValue({
      id: 'owner-1',
      email: 'owner-1@test.com',
      fullName: 'Owner One',
      role: UserRole.OWNER,
      status: UserStatus.PENDING_APPROVAL,
    });
    repo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.approveOwner('owner-1');

    expect(result.status).toBe(UserStatus.ACTIVE);
    expect(notificationsService.notifyOwnerApproved).toHaveBeenCalledWith({
      to: 'owner-1@test.com',
      fullName: 'Owner One',
    });
  });

  it('approveOwner rejects a user that is not pending approval', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({
      id: 'owner-1',
      role: UserRole.OWNER,
      status: UserStatus.ACTIVE,
    });

    await expect(service.approveOwner('owner-1')).rejects.toThrow();
  });

  it('rejectOwner marks a pending owner as rejected and sends a rejection email with the reason', async () => {
    const { service, repo, notificationsService } = await buildTestingModule();
    repo.findOne.mockResolvedValue({
      id: 'owner-1',
      email: 'owner-1@test.com',
      fullName: 'Owner One',
      role: UserRole.OWNER,
      status: UserStatus.PENDING_APPROVAL,
    });
    repo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.rejectOwner(
      'owner-1',
      'Thiếu giấy phép kinh doanh',
    );

    expect(result.status).toBe(UserStatus.REJECTED);
    expect(notificationsService.notifyOwnerRejected).toHaveBeenCalledWith({
      to: 'owner-1@test.com',
      fullName: 'Owner One',
      reason: 'Thiếu giấy phép kinh doanh',
    });
  });
});

describe('UsersService.updatePassword', () => {
  it('hashes and saves the new password', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({ id: 'user-1', passwordHash: 'old-hash' });
    repo.save.mockImplementation((data) => Promise.resolve(data));

    await service.updatePassword('user-1', 'brand-new-password');

    const saved = await repo.save.mock.results[0].value;
    expect(saved.passwordHash).not.toBe('old-hash');
    await expect(
      bcrypt.compare('brand-new-password', saved.passwordHash),
    ).resolves.toBe(true);
  });
});

describe('UsersService.updateProfile', () => {
  it('updates only the provided fields', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({
      id: 'user-1',
      fullName: 'Old Name',
      phone: '0900000000',
      avatarUrl: null,
    });
    repo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.updateProfile('user-1', {
      fullName: 'New Name',
    });

    expect(result.fullName).toBe('New Name');
    expect(result.phone).toBe('0900000000');
  });

  it('updates the address field when provided', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({
      id: 'user-1',
      fullName: 'A B',
      phone: null,
      avatarUrl: null,
      address: null,
    });
    repo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.updateProfile('user-1', {
      address: '123 Lê Lợi, Q1',
    });

    expect(result.address).toBe('123 Lê Lợi, Q1');
  });
});

describe('UsersService.findByIds', () => {
  it('queries users by a list of ids', async () => {
    const { service, repo } = await buildTestingModule();
    repo.find.mockResolvedValue([{ id: 'owner-1' }, { id: 'owner-2' }]);

    const result = await service.findByIds(['owner-1', 'owner-2']);

    expect(result).toEqual([{ id: 'owner-1' }, { id: 'owner-2' }]);
  });

  it('returns an empty array without querying when given no ids', async () => {
    const { service, repo } = await buildTestingModule();

    const result = await service.findByIds([]);

    expect(result).toEqual([]);
    expect(repo.find).not.toHaveBeenCalled();
  });
});

describe('UsersService.findActiveOwners', () => {
  it('queries for active owners', async () => {
    const { service, repo } = await buildTestingModule();
    repo.find.mockResolvedValue([
      { id: 'owner-1', role: UserRole.OWNER, status: UserStatus.ACTIVE },
    ]);

    const result = await service.findActiveOwners();

    expect(repo.find).toHaveBeenCalledWith({
      where: { role: UserRole.OWNER, status: UserStatus.ACTIVE },
    });
    expect(result).toHaveLength(1);
  });
});
