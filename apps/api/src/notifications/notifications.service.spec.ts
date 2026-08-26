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

describe('NotificationsService.notifyOwnerApproved', () => {
  it('sends an approval email to the owner', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyOwnerApproved({
      to: 'owner@test.com',
      fullName: 'Nguyễn Văn A',
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'owner@test.com',
      'Tài khoản chủ sân đã được duyệt',
      expect.stringContaining('Nguyễn Văn A'),
    );
  });
});

describe('NotificationsService.notifyOwnerRejected', () => {
  it('includes the reason in the email when provided', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyOwnerRejected({
      to: 'owner@test.com',
      fullName: 'Nguyễn Văn A',
      reason: 'Thiếu giấy phép kinh doanh',
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'owner@test.com',
      'Tài khoản chủ sân đã bị từ chối',
      expect.stringContaining('Thiếu giấy phép kinh doanh'),
    );
  });

  it('omits the reason section when not provided', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyOwnerRejected({
      to: 'owner@test.com',
      fullName: 'Nguyễn Văn A',
    });

    const html = mailService.send.mock.calls[0][2];
    expect(html).not.toContain('Lý do');
  });
});

describe('NotificationsService.notifyVenueApproved', () => {
  it('sends an approval email naming the venue', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyVenueApproved({
      to: 'owner@test.com',
      ownerName: 'Nguyễn Văn A',
      venueName: 'Sân ABC',
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'owner@test.com',
      'Chi nhánh đã được duyệt',
      expect.stringContaining('Sân ABC'),
    );
  });
});

describe('NotificationsService.notifyVenueRejected', () => {
  it('includes the reason in the email when provided', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyVenueRejected({
      to: 'owner@test.com',
      ownerName: 'Nguyễn Văn A',
      venueName: 'Sân ABC',
      reason: 'Thiếu giấy phép kinh doanh',
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'owner@test.com',
      'Chi nhánh đã bị từ chối',
      expect.stringContaining('Thiếu giấy phép kinh doanh'),
    );
  });
});

describe('NotificationsService.notifyDisputeRejected', () => {
  it('includes the reason in the email when provided', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyDisputeRejected({
      to: 'customer@test.com',
      customerName: 'Nguyễn Văn A',
      reason: 'Không đủ căn cứ hoàn tiền',
    });

    expect(mailService.send).toHaveBeenCalledWith(
      'customer@test.com',
      'Khiếu nại của bạn đã bị từ chối',
      expect.stringContaining('Không đủ căn cứ hoàn tiền'),
    );
  });

  it('omits the reason section when not provided', async () => {
    const { service, mailService } = await buildTestingModule();

    await service.notifyDisputeRejected({
      to: 'customer@test.com',
      customerName: 'Nguyễn Văn A',
    });

    const html = mailService.send.mock.calls[0][2];
    expect(html).not.toContain('Lý do');
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
