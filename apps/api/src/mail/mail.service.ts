import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly apiBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('MAIL_HOST', 'localhost'),
      port: this.config.get<number>('MAIL_PORT', 1025),
      secure: false,
    });
    this.from = this.config.get<string>('MAIL_FROM', 'no-reply@pickleball.local');
    this.apiBaseUrl = this.config.get<string>('API_BASE_URL', 'http://localhost:3001');
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = `${this.apiBaseUrl}/auth/verify-email?token=${token}`;
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Xác thực email của bạn',
      html: `<p>Nhấn vào link để xác thực email: <a href="${link}">${link}</a></p>`,
    });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const link = `${this.apiBaseUrl}/auth/reset-password?token=${token}`;
    await this.transporter.sendMail({
      from: this.from,
      to,
      subject: 'Đặt lại mật khẩu',
      html: `<p>Nhấn vào link để đặt lại mật khẩu: <a href="${link}">${link}</a></p>`,
    });
  }
}
