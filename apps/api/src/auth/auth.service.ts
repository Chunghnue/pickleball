import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { UserRole, UserStatus } from '../users/entities/user.entity';
import { MailService } from '../mail/mail.service';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { generateToken, hashToken } from './token.util';
import { RegisterDto } from './dto/register.dto';

const EMAIL_VERIFICATION_TTL_HOURS = 24;

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly mailService: MailService,
    @InjectRepository(EmailVerificationToken)
    private readonly verificationTokens: Repository<EmailVerificationToken>,
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
}
