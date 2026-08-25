import { Injectable, Logger } from '@nestjs/common';
import { MailService } from '../mail/mail.service';

const currencyFormatter = new Intl.NumberFormat('vi-VN');

export interface BookingConfirmedParams {
  to: string;
  customerName: string;
  venueName: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
}

export interface BookingCancelledParams {
  to: string;
  venueName: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  cancelledBy: 'customer' | 'owner';
}

export interface NewBookingForOwnerParams {
  to: string;
  venueName: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  customerName: string;
  customerPhone: string | null;
  totalPrice: number;
}

export interface PaymentStatusParams {
  to: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly mailService: MailService) {}

  notifyBookingConfirmed(params: BookingConfirmedParams): Promise<void> {
    const html = `<p>Chào ${params.customerName}, bạn đã đặt sân thành công.<br/>
Sân: ${params.courtName} - ${params.venueName}<br/>
Ngày: ${params.date}, ${params.startTime} - ${params.endTime}<br/>
Tổng tiền: ${currencyFormatter.format(params.totalPrice)} đ</p>`;
    return this.sendSafely(params.to, 'Xác nhận đặt sân', html);
  }

  notifyBookingCancelled(params: BookingCancelledParams): Promise<void> {
    const who = params.cancelledBy === 'owner' ? 'chủ sân' : 'bạn';
    const html = `<p>Booking sau đã được huỷ bởi ${who}:<br/>
Sân: ${params.courtName} - ${params.venueName}<br/>
Ngày: ${params.date}, ${params.startTime} - ${params.endTime}</p>`;
    return this.sendSafely(params.to, 'Booking đã được huỷ', html);
  }

  notifyNewBookingForOwner(params: NewBookingForOwnerParams): Promise<void> {
    const phone = params.customerPhone ? ` - ${params.customerPhone}` : '';
    const html = `<p>Bạn vừa có một booking mới:<br/>
Sân: ${params.courtName} - ${params.venueName}<br/>
Ngày: ${params.date}, ${params.startTime} - ${params.endTime}<br/>
Khách: ${params.customerName}${phone}<br/>
Tổng tiền: ${currencyFormatter.format(params.totalPrice)} đ</p>`;
    return this.sendSafely(params.to, 'Có booking mới', html);
  }

  notifyPaymentConfirmed(params: PaymentStatusParams): Promise<void> {
    const html = `<p>Thanh toán cho booking ngày ${params.date}, ${params.startTime} - ${params.endTime} (${currencyFormatter.format(params.totalPrice)} đ) đã được xác nhận.</p>`;
    return this.sendSafely(params.to, 'Xác nhận đã thanh toán', html);
  }

  notifyPaymentRefunded(params: PaymentStatusParams): Promise<void> {
    const html = `<p>Booking ngày ${params.date}, ${params.startTime} - ${params.endTime} (${currencyFormatter.format(params.totalPrice)} đ) đã được hoàn tiền.</p>`;
    return this.sendSafely(params.to, 'Xác nhận hoàn tiền', html);
  }

  private async sendSafely(
    to: string,
    subject: string,
    html: string,
  ): Promise<void> {
    if (!to) {
      this.logger.warn(
        `Bỏ qua gửi email "${subject}" vì thiếu địa chỉ người nhận`,
      );
      return;
    }
    try {
      await this.mailService.send(to, subject, html);
    } catch (error) {
      this.logger.warn(
        `Gửi email "${subject}" tới ${to} thất bại: ${(error as Error).message}`,
      );
    }
  }
}
