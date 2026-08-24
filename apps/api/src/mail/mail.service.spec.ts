import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';

jest.mock('nodemailer');

describe('MailService', () => {
  let service: MailService;
  const sendMail = jest.fn().mockResolvedValue(undefined);

  beforeEach(async () => {
    (nodemailer.createTransport as jest.Mock).mockReturnValue({ sendMail });
    sendMail.mockClear();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailService,
        {
          provide: ConfigService,
          useValue: {
            get: (key: string, fallback?: string) =>
              ({
                MAIL_HOST: 'localhost',
                MAIL_PORT: '1025',
                MAIL_FROM: 'no-reply@pickleball.local',
                APP_URL: 'http://localhost:3000',
              })[key] ?? fallback,
          },
        },
      ],
    }).compile();

    service = module.get(MailService);
  });

  it('sends a verification email linking to the frontend app', async () => {
    await service.sendVerificationEmail('user@test.com', 'raw-token-123');

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@test.com',
        subject: expect.any(String),
        html: expect.stringContaining(
          'http://localhost:3000/verify-email?token=raw-token-123',
        ),
      }),
    );
  });

  it('sends a password reset email linking to the frontend app', async () => {
    await service.sendPasswordResetEmail('user@test.com', 'reset-token-456');

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@test.com',
        html: expect.stringContaining(
          'http://localhost:3000/reset-password?token=reset-token-456',
        ),
      }),
    );
  });
});
