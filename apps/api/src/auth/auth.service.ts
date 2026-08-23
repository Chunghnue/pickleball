import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { UserRole } from '../users/entities/user.entity';
import { MailService } from '../mail/mail.service';
import { EmailVerificationToken } from './entities/email-verification-token.entity';
import { generateToken } from './token.util';
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
}
