import { ConflictException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { StaffService } from './staff.service';
import { StaffRole, User, UserRole, UserStatus } from '../users/entities/user.entity';

const mockUsersRepository = () => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      StaffService,
      { provide: getRepositoryToken(User), useFactory: mockUsersRepository },
    ],
  }).compile();

  return {
    service: module.get(StaffService),
    usersRepo: module.get(getRepositoryToken(User)) as ReturnType<typeof mockUsersRepository>,
  };
}

describe('StaffService.create', () => {
  it('creates an active staff account scoped to the owner', async () => {
    const { service, usersRepo } = await buildTestingModule();
    usersRepo.findOne.mockResolvedValue(null); // no phone/email conflict
    usersRepo.create.mockImplementation((data) => data);
    usersRepo.save.mockImplementation((data) => Promise.resolve({ id: 'staff-1', ...data }));

    const result = await service.create('owner-1', {
      fullName: 'Nguyễn Văn A',
      phone: '0911000099',
      staffRole: StaffRole.CASHIER,
      password: 'password1',
    });

    expect(result).toMatchObject({
      id: 'staff-1',
      fullName: 'Nguyễn Văn A',
      role: UserRole.STAFF,
      staffRole: StaffRole.CASHIER,
    });
    expect(usersRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        ownerId: 'owner-1',
        role: UserRole.STAFF,
        status: UserStatus.ACTIVE,
      }),
    );
  });

  it('rejects a duplicate phone number', async () => {
    const { service, usersRepo } = await buildTestingModule();
    usersRepo.findOne.mockResolvedValueOnce({ id: 'existing-user' });

    await expect(
      service.create('owner-1', {
        fullName: 'B',
        phone: '0911000099',
        staffRole: StaffRole.STAFF,
        password: 'password1',
      }),
    ).rejects.toThrow(ConflictException);
  });
});

describe('StaffService.list', () => {
  it('includes the owner as a "Chủ sân" row alongside staff', async () => {
    const { service, usersRepo } = await buildTestingModule();
    usersRepo.findOne.mockResolvedValue({
      id: 'owner-1',
      fullName: 'Chủ sân',
      phone: '0900000001',
      email: 'owner@test.com',
      role: UserRole.OWNER,
      staffRole: null,
      status: UserStatus.ACTIVE,
    });
    usersRepo.find.mockResolvedValue([
      {
        id: 'staff-1',
        fullName: 'Cashier A',
        phone: '0911000099',
        email: null,
        role: UserRole.STAFF,
        staffRole: StaffRole.CASHIER,
        status: UserStatus.ACTIVE,
      },
    ]);

    const result = await service.list('owner-1', {});

    expect(result.map((r) => r.id)).toEqual(['owner-1', 'staff-1']);
  });

  it('filters by staffRole (excludes the owner row, which has no staffRole)', async () => {
    const { service, usersRepo } = await buildTestingModule();
    usersRepo.findOne.mockResolvedValue({
      id: 'owner-1',
      fullName: 'Chủ sân',
      phone: '0900000001',
      email: 'owner@test.com',
      role: UserRole.OWNER,
      staffRole: null,
      status: UserStatus.ACTIVE,
    });
    usersRepo.find.mockResolvedValue([
      {
        id: 'staff-1',
        fullName: 'Cashier A',
        phone: '0911000099',
        email: null,
        role: UserRole.STAFF,
        staffRole: StaffRole.CASHIER,
        status: UserStatus.ACTIVE,
      },
    ]);

    const result = await service.list('owner-1', { staffRole: StaffRole.CASHIER });

    expect(result.map((r) => r.id)).toEqual(['staff-1']);
  });
});
