import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly appUrl: string;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: this.config.get<string>('MAIL_HOST', 'localhost'),
      port: this.config.get<number>('MAIL_PORT', 1025),
      secure: false,
    });
    this.from = this.config.get<string>('MAIL_FROM', 'no-reply@pickleball.local');
    this.appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
  }

  async send(to: string, subject: string, html: string): Promise<void> {
    await this.transporter.sendMail({ from: this.from, to, subject, html });
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = `${this.appUrl}/verify-email?token=${token}`;
    await this.send(
      to,
      'Xác thực email của bạn',
      `<p>Nhấn vào link để xác thực email: <a href="${link}">${link}</a></p>`,
    );
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const link = `${this.appUrl}/reset-password?token=${token}`;
    await this.send(
      to,
      'Đặt lại mật khẩu',
      `<p>Nhấn vào link để đặt lại mật khẩu: <a href="${link}">${link}</a></p>`,
    );
  }
}
