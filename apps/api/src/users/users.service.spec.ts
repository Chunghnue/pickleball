import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User, UserRole, UserStatus } from './entities/user.entity';

const mockRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let repo: ReturnType<typeof mockRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useFactory: mockRepository },
      ],
    }).compile();

    service = module.get(UsersService);
    repo = module.get(getRepositoryToken(User));
  });

  it('hashes the password and defaults status/role fields before saving', async () => {
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
  let service: UsersService;
  let repo: ReturnType<typeof mockRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useFactory: mockRepository },
      ],
    }).compile();

    service = module.get(UsersService);
    repo = module.get(getRepositoryToken(User));
  });

  it('sets emailVerified and the given status', async () => {
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
  let service: UsersService;
  let repo: ReturnType<typeof mockRepository> & { find: jest.Mock };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useFactory: () => ({ ...mockRepository(), find: jest.fn() }),
        },
      ],
    }).compile();

    service = module.get(UsersService);
    repo = module.get(getRepositoryToken(User));
  });

  it('findPendingOwners returns owners awaiting approval', async () => {
    repo.find.mockResolvedValue([{ id: 'owner-1' }]);

    const result = await service.findPendingOwners();

    expect(repo.find).toHaveBeenCalledWith({
      where: { role: UserRole.OWNER, status: UserStatus.PENDING_APPROVAL },
    });
    expect(result).toEqual([{ id: 'owner-1' }]);
  });

  it('approveOwner activates a pending owner', async () => {
    repo.findOne.mockResolvedValue({
      id: 'owner-1',
      role: UserRole.OWNER,
      status: UserStatus.PENDING_APPROVAL,
    });
    repo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.approveOwner('owner-1');

    expect(result.status).toBe(UserStatus.ACTIVE);
  });

  it('approveOwner rejects a user that is not pending approval', async () => {
    repo.findOne.mockResolvedValue({
      id: 'owner-1',
      role: UserRole.OWNER,
      status: UserStatus.ACTIVE,
    });

    await expect(service.approveOwner('owner-1')).rejects.toThrow();
  });

  it('rejectOwner marks a pending owner as rejected', async () => {
    repo.findOne.mockResolvedValue({
      id: 'owner-1',
      role: UserRole.OWNER,
      status: UserStatus.PENDING_APPROVAL,
    });
    repo.save.mockImplementation((data) => Promise.resolve(data));

    const result = await service.rejectOwner('owner-1');

    expect(result.status).toBe(UserStatus.REJECTED);
  });
});

describe('UsersService.updatePassword', () => {
  let service: UsersService;
  let repo: ReturnType<typeof mockRepository>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useFactory: mockRepository },
      ],
    }).compile();

    service = module.get(UsersService);
    repo = module.get(getRepositoryToken(User));
  });

  it('hashes and saves the new password', async () => {
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
