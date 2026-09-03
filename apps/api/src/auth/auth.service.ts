import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { UserRole, UserStatus } from '../users/entities/user.entity';
import { MailService } from '../mail/mail.service';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { PasswordResetToken } from './entities/password-reset-token.entity';
import { generateToken, hashToken } from './token.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const EMAIL_VERIFICATION_TTL_HOURS = 24;
const PASSWORD_RESET_TTL_HOURS = 1;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(EmailVerificationToken)
    private readonly verificationTokens: Repository<EmailVerificationToken>,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(PasswordResetToken)
    private readonly passwordResetTokens: Repository<PasswordResetToken>,
  ) {}

  registerCustomer(dto: RegisterDto): Promise<{ id: string; email: string }> {
    return this.register(dto, UserRole.CUSTOMER);
  }

  registerOwner(dto: RegisterDto): Promise<{ id: string; email: string }> {
    return this.register(dto, UserRole.OWNER);
  }

  private async register(
    dto: RegisterDto,
    role: UserRole,
  ): Promise<{ id: string; email: string }> {
    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email đã được sử dụng');
    }

    const user = await this.usersService.create({
      email: dto.email,
      password: dto.password,
      fullName: dto.fullName,
      phone: dto.phone,
      role,
    });

    const { raw, hash } = generateToken();
    const expiresAt = new Date(
      Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 60 * 60 * 1000,
    );
    await this.verificationTokens.save(
      this.verificationTokens.create({
        userId: user.id,
        tokenHash: hash,
        expiresAt,
      }),
    );
    // customer/owner registration always supplies email (RegisterDto requires it) —
    // only staff accounts (created via /staff, never through this flow) can be null.
    await this.mailService.sendVerificationEmail(user.email!, raw);

    return { id: user.id, email: user.email! };
  }

  async verifyEmail(rawToken: string): Promise<{ status: UserStatus }> {
    const tokenHashValue = hashToken(rawToken);
    const tokenRecord = await this.verificationTokens.findOne({
      where: { tokenHash: tokenHashValue },
    });
    if (!tokenRecord) {
      throw new BadRequestException('Token không hợp lệ');
    }
    if (tokenRecord.expiresAt.getTime() < Date.now()) {
      await this.verificationTokens.delete({ id: tokenRecord.id });
      throw new BadRequestException('Token đã hết hạn');
    }

    const user = await this.usersService.findById(tokenRecord.userId);
    if (!user) {
      throw new BadRequestException('Token không hợp lệ');
    }

    const nextStatus =
      user.role === UserRole.OWNER
        ? UserStatus.PENDING_APPROVAL
        : UserStatus.ACTIVE;
    const updated = await this.usersService.markVerified(user.id, nextStatus);
    await this.verificationTokens.delete({ id: tokenRecord.id });

    return { status: updated.status };
  }

  async login(
    dto: LoginDto,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const user =
      (await this.usersService.findByEmail(dto.identifier)) ??
      (await this.usersService.findByPhone(dto.identifier));
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Thông tin đăng nhập không đúng');
    }

    this.assertActive(user.status);

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
      ownerId: user.ownerId,
      staffRole: user.staffRole,
    });
    const refreshToken = await this.issueRefreshToken(user.id);

    return { accessToken, refreshToken };
  }

  private assertActive(status: UserStatus): void {
    const messages: Partial<Record<UserStatus, string>> = {
      [UserStatus.PENDING_VERIFICATION]:
        'Vui lòng xác thực email trước khi đăng nhập',
      [UserStatus.PENDING_APPROVAL]: 'Tài khoản đang chờ admin duyệt',
      [UserStatus.REJECTED]: 'Tài khoản đã bị từ chối',
      [UserStatus.SUSPENDED]: 'Tài khoản đã bị khoá',
    };
    if (status !== UserStatus.ACTIVE) {
      throw new ForbiddenException(
        messages[status] ?? 'Tài khoản không thể đăng nhập',
      );
    }
  }

  private async issueRefreshToken(userId: string): Promise<string> {
    const { raw, hash } = generateToken();
    const ttlDays = Number(this.config.get('REFRESH_TOKEN_TTL_DAYS', 30));
    const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);
    await this.refreshTokenRepository.save(
      this.refreshTokenRepository.create({ userId, tokenHash: hash, expiresAt }),
    );
    return raw;
  }

  async refreshTokens(
    rawRefreshToken: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const tokenHashValue = hashToken(rawRefreshToken);
    const tokenRecord = await this.refreshTokenRepository.findOne({
      where: { tokenHash: tokenHashValue },
    });
    if (!tokenRecord || tokenRecord.revokedAt) {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
    if (tokenRecord.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token đã hết hạn');
    }

    const user = await this.usersService.findById(tokenRecord.userId);
    if (!user) {
      throw new UnauthorizedException('Refresh token không hợp lệ');
    }
    this.assertActive(user.status);

    tokenRecord.revokedAt = new Date();
    await this.refreshTokenRepository.save(tokenRecord);

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
      ownerId: user.ownerId,
      staffRole: user.staffRole,
    });
    const refreshToken = await this.issueRefreshToken(user.id);

    return { accessToken, refreshToken };
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHashValue = hashToken(rawRefreshToken);
    const tokenRecord = await this.refreshTokenRepository.findOne({
      where: { tokenHash: tokenHashValue },
    });
    if (tokenRecord && !tokenRecord.revokedAt) {
      tokenRecord.revokedAt = new Date();
      await this.refreshTokenRepository.save(tokenRecord);
    }
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await this.usersService.findByEmail(email);
    if (!user) {
      return;
    }

    const { raw, hash } = generateToken();
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_TTL_HOURS * 60 * 60 * 1000,
    );
    await this.passwordResetTokens.save(
      this.passwordResetTokens.create({
        userId: user.id,
        tokenHash: hash,
        expiresAt,
      }),
    );
    // found via findByEmail(email), so user.email is that same non-null string
    await this.mailService.sendPasswordResetEmail(user.email!, raw);
  }

  async resetPassword(rawToken: string, newPassword: string): Promise<void> {
    const tokenHashValue = hashToken(rawToken);
    const tokenRecord = await this.passwordResetTokens.findOne({
      where: { tokenHash: tokenHashValue },
    });
    if (!tokenRecord || tokenRecord.usedAt) {
      throw new BadRequestException('Token không hợp lệ');
    }
    if (tokenRecord.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('Token đã hết hạn');
    }

    await this.usersService.updatePassword(tokenRecord.userId, newPassword);

    tokenRecord.usedAt = new Date();
    await this.passwordResetTokens.save(tokenRecord);

    await this.revokeAllRefreshTokens(tokenRecord.userId);
  }

  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await this.usersService.findById(userId);
    if (!user || !(await bcrypt.compare(currentPassword, user.passwordHash))) {
      throw new BadRequestException('Mật khẩu hiện tại không đúng');
    }
    await this.usersService.updatePassword(userId, newPassword);
    await this.revokeAllRefreshTokens(userId);
  }

  private async revokeAllRefreshTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, revokedAt: IsNull() },
      { revokedAt: new Date() },
    );
  }
}
