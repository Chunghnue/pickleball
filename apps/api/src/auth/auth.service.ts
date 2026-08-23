import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { UserRole, UserStatus } from '../users/entities/user.entity';
import { MailService } from '../mail/mail.service';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { RefreshToken } from './entities/refresh-token.entity';
import { generateToken, hashToken } from './token.util';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const EMAIL_VERIFICATION_TTL_HOURS = 24;

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
    await this.mailService.sendVerificationEmail(user.email, raw);

    return { id: user.id, email: user.email };
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
    const user = await this.usersService.findByEmail(dto.email);
    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }

    this.assertActive(user.status);

    const accessToken = await this.jwtService.signAsync({
      sub: user.id,
      role: user.role,
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
}
