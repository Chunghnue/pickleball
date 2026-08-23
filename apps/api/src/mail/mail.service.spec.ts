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
                API_BASE_URL: 'http://localhost:3001',
              })[key] ?? fallback,
          },
        },
      ],
    }).compile();

    service = module.get(MailService);
  });

  it('sends a verification email with a link containing the raw token', async () => {
    await service.sendVerificationEmail('user@test.com', 'raw-token-123');

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@test.com',
        subject: expect.any(String),
        html: expect.stringContaining('raw-token-123'),
      }),
    );
  });

  it('sends a password reset email with a link containing the raw token', async () => {
    await service.sendPasswordResetEmail('user@test.com', 'reset-token-456');

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@test.com',
        html: expect.stringContaining('reset-token-456'),
      }),
    );
  });
});
