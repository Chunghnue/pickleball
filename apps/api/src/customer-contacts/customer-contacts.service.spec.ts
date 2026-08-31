import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { QueryFailedError } from 'typeorm';
import { CustomerContactsService } from './customer-contacts.service';
import { CustomerContact } from './entities/customer-contact.entity';
import { UsersService } from '../users/users.service';

const mockRepository = () => ({
  findOne: jest.fn(),
  create: jest.fn((data: unknown) => data),
  save: jest.fn((data: unknown) => Promise.resolve({ id: 'contact-1', ...(data as object) })),
});

const mockUsersService = () => ({
  findById: jest.fn(),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      CustomerContactsService,
      { provide: getRepositoryToken(CustomerContact), useFactory: mockRepository },
      { provide: UsersService, useFactory: mockUsersService },
    ],
  }).compile();

  return {
    service: module.get(CustomerContactsService),
    repo: module.get(getRepositoryToken(CustomerContact)) as ReturnType<typeof mockRepository>,
    usersService: module.get(UsersService) as ReturnType<typeof mockUsersService>,
  };
}

describe('CustomerContactsService.resolveSelector', () => {
  it('throws BadRequestException when no selector field is provided', async () => {
    const { service } = await buildTestingModule();
    await expect(service.resolveSelector('owner-1', {})).rejects.toThrow(
      'Phải cung cấp đúng một trong customerId, customerContactId hoặc newCustomer',
    );
  });

  it('throws BadRequestException when more than one selector field is provided', async () => {
    const { service } = await buildTestingModule();
    await expect(
      service.resolveSelector('owner-1', { customerId: 'u1', customerContactId: 'c1' }),
    ).rejects.toThrow('Phải cung cấp đúng một trong customerId, customerContactId hoặc newCustomer');
  });

  it('resolves an existing customerId after checking it exists', async () => {
    const { service, usersService } = await buildTestingModule();
    usersService.findById.mockResolvedValue({ id: 'u1' });

    const result = await service.resolveSelector('owner-1', { customerId: 'u1' });

    expect(result).toEqual({ customerId: 'u1' });
  });

  it('throws NotFoundException when customerId does not exist', async () => {
    const { service, usersService } = await buildTestingModule();
    usersService.findById.mockResolvedValue(null);

    await expect(
      service.resolveSelector('owner-1', { customerId: 'missing' }),
    ).rejects.toThrow('Khách hàng missing không tồn tại');
  });

  it('resolves an existing customerContactId scoped to the owner', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({ id: 'contact-1', ownerId: 'owner-1' });

    const result = await service.resolveSelector('owner-1', { customerContactId: 'contact-1' });

    expect(repo.findOne).toHaveBeenCalledWith({ where: { id: 'contact-1', ownerId: 'owner-1' } });
    expect(result).toEqual({ customerContactId: 'contact-1' });
  });

  it('creates a new contact when newCustomer has an unseen phone', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue(null);

    const result = await service.resolveSelector('owner-1', {
      newCustomer: { fullName: 'Nguyễn Văn A', phone: '0900000000' },
    });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: 'owner-1', fullName: 'Nguyễn Văn A', phone: '0900000000' }),
    );
    expect(result).toEqual({ customerContactId: 'contact-1' });
  });

  it('reuses an existing contact with the same phone instead of creating a duplicate', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne.mockResolvedValue({ id: 'contact-9', ownerId: 'owner-1', fullName: 'Old Name', phone: '0900000000' });

    const result = await service.resolveSelector('owner-1', {
      newCustomer: { fullName: 'New Name', phone: '0900000000' },
    });

    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'contact-9', fullName: 'New Name' }),
    );
    expect(result).toEqual({ customerContactId: 'contact-9' });
  });

  it('falls back to the winning row when a concurrent insert violates the unique index', async () => {
    const { service, repo } = await buildTestingModule();
    repo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'contact-race', ownerId: 'owner-1' });
    const uniqueViolation = Object.assign(new QueryFailedError('INSERT', [], new Error('dup')), {
      code: '23505',
    });
    repo.save.mockRejectedValueOnce(uniqueViolation);

    const result = await service.resolveSelector('owner-1', {
      newCustomer: { fullName: 'Nguyễn Văn A', phone: '0900000000' },
    });

    expect(result).toEqual({ customerContactId: 'contact-race' });
  });
});
