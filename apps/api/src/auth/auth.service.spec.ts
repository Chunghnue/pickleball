import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';
import { MailService } from '../mail/mail.service';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';

const mockUsersService = () => ({
  findById: jest.fn(),
  updatePassword: jest.fn().mockResolvedValue(undefined),
});
const mockMailService = () => ({});
const mockJwtService = () => ({});
const mockConfigService = () => ({ get: jest.fn() });
const mockRepository = () => ({
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
  update: jest.fn().mockResolvedValue(undefined),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      AuthService,
      { provide: UsersService, useFactory: mockUsersService },
      { provide: MailService, useFactory: mockMailService },
      { provide: JwtService, useFactory: mockJwtService },
      { provide: ConfigService, useFactory: mockConfigService },
      { provide: getRepositoryToken(EmailVerificationToken), useFactory: mockRepository },
      { provide: getRepositoryToken(RefreshToken), useFactory: mockRepository },
      { provide: getRepositoryToken(PasswordResetToken), useFactory: mockRepository },
    ],
  }).compile();

  return {
    service: module.get(AuthService),
    usersService: module.get(UsersService) as ReturnType<typeof mockUsersService>,
    refreshTokenRepo: module.get(getRepositoryToken(RefreshToken)) as ReturnType<typeof mockRepository>,
  };
}

describe('AuthService.changePassword', () => {
  it('rejects when currentPassword does not match', async () => {
    const { service, usersService } = await buildTestingModule();
    const hash = await bcrypt.hash('correct-password', 10);
    usersService.findById.mockResolvedValue({ id: 'user-1', passwordHash: hash });

    await expect(
      service.changePassword('user-1', 'wrong-password', 'new-password123'),
    ).rejects.toThrow(BadRequestException);
    expect(usersService.updatePassword).not.toHaveBeenCalled();
  });

  it('updates the password and revokes all refresh tokens when currentPassword matches', async () => {
    const { service, usersService, refreshTokenRepo } = await buildTestingModule();
    const hash = await bcrypt.hash('correct-password', 10);
    usersService.findById.mockResolvedValue({ id: 'user-1', passwordHash: hash });

    await service.changePassword('user-1', 'correct-password', 'new-password123');

    expect(usersService.updatePassword).toHaveBeenCalledWith('user-1', 'new-password123');
    expect(refreshTokenRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1' }),
      expect.objectContaining({ revokedAt: expect.any(Date) }),
    );
  });
});
