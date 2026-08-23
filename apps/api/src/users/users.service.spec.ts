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
