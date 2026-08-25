import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsService } from './notifications.service';
import { MailService } from '../mail/mail.service';

const mockMailService = () => ({
  send: jest.fn().mockResolvedValue(undefined),
});

async function buildTestingModule() {
  const module: TestingModule = await Test.createTestingModule({
    providers: [
      NotificationsService,
      { provide: MailService, useFactory: mockMailService },
    ],
  }).compile();

  return {
    service: module.get(NotificationsService),
    mailService: module.get(MailService) as ReturnType<typeof mockMailService>,
  };
}

describe('NotificationsService.notifyBookingConfirmed', () => {
  it('sends a confirmation email with booking details', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyBookingConfirmed({
      to: 'customer@test.com',
      customerName: 'Nguyễn Văn A',
      venueName: 'Venue A',
      courtName: 'Sân 1',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: 100000,
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'customer@test.com',
      'Xác nhận đặt sân',
      expect.stringContaining('Sân 1'),
    );
  });
});

describe('NotificationsService.notifyBookingCancelled', () => {
  it('sends a cancellation email naming who cancelled', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyBookingCancelled({
      to: 'customer@test.com',
      venueName: 'Venue A',
      courtName: 'Sân 1',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
      cancelledBy: 'owner',
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'customer@test.com',
      'Booking đã được huỷ',
      expect.stringContaining('Sân 1'),
    );
  });
});

describe('NotificationsService.notifyNewBookingForOwner', () => {
  it('sends a new-booking email to the owner with customer contact info', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyNewBookingForOwner({
      to: 'owner@test.com',
      venueName: 'Venue A',
      courtName: 'Sân 1',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
      customerName: 'Nguyễn Văn A',
      customerPhone: '0900000000',
      totalPrice: 100000,
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'owner@test.com',
      'Có booking mới',
      expect.stringContaining('Nguyễn Văn A'),
    );
  });
});

describe('NotificationsService.notifyPaymentConfirmed', () => {
  it('sends a payment confirmation email without venue/court name', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyPaymentConfirmed({
      to: 'customer@test.com',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: 100000,
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'customer@test.com',
      'Xác nhận đã thanh toán',
      expect.any(String),
    );
  });
});

describe('NotificationsService.notifyPaymentRefunded', () => {
  it('sends a refund confirmation email', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyPaymentRefunded({
      to: 'customer@test.com',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: 100000,
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'customer@test.com',
      'Xác nhận hoàn tiền',
      expect.any(String),
    );
  });
});

describe('NotificationsService best-effort error handling', () => {
  it('resolves without throwing when MailService.send rejects', async () => {
    const { service, mailService } = await buildTestingModule();
    mailService.send.mockRejectedValue(new Error('SMTP down'));

    await expect(
      service.notifyBookingConfirmed({
        to: 'customer@test.com',
        customerName: 'A',
        venueName: 'V',
        courtName: 'C',
        date: '2099-01-01',
        startTime: '08:00',
        endTime: '09:00',
        totalPrice: 100000,
      }),
    ).resolves.toBeUndefined();
  });

  it('skips sending and resolves when "to" is empty', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyPaymentConfirmed({
      to: '',
      date: '2099-01-01',
      startTime: '08:00',
      endTime: '09:00',
      totalPrice: 100000,
    });

    expect(mailService.send).not.toHaveBeenCalled();
  });
});
