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

export interface OwnerApprovalParams {
  to: string;
  fullName: string;
}

export interface OwnerRejectionParams {
  to: string;
  fullName: string;
  reason?: string;
}

export interface VenueApprovalParams {
  to: string;
  ownerName: string;
  venueName: string;
}

export interface VenueRejectionParams {
  to: string;
  ownerName: string;
  venueName: string;
  reason?: string;
}

export interface DisputeRejectionParams {
  to: string;
  customerName: string;
  reason?: string;
}

export interface BookingCancelledForOwnerParams {
  to: string;
  venueName: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
}

export interface PaymentConfirmedForOwnerParams {
  to: string;
  venueName: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  totalPrice: number;
}

export interface DailyReportParams {
  to: string;
  bookingsCount: number;
  revenue: number;
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

  notifyOwnerApproved(params: OwnerApprovalParams): Promise<void> {
    const html = `<p>Chào ${params.fullName}, tài khoản chủ sân của bạn đã được duyệt. Bạn có thể đăng nhập và bắt đầu tạo chi nhánh.</p>`;
    return this.sendSafely(params.to, 'Tài khoản chủ sân đã được duyệt', html);
  }

  notifyOwnerRejected(params: OwnerRejectionParams): Promise<void> {
    const reasonHtml = params.reason ? `<p>Lý do: ${params.reason}</p>` : '';
    const html = `<p>Chào ${params.fullName}, tài khoản chủ sân của bạn đã bị từ chối.</p>${reasonHtml}`;
    return this.sendSafely(params.to, 'Tài khoản chủ sân đã bị từ chối', html);
  }

  notifyVenueApproved(params: VenueApprovalParams): Promise<void> {
    const html = `<p>Chào ${params.ownerName}, chi nhánh "${params.venueName}" của bạn đã được duyệt và hiển thị công khai.</p>`;
    return this.sendSafely(params.to, 'Chi nhánh đã được duyệt', html);
  }

  notifyVenueRejected(params: VenueRejectionParams): Promise<void> {
    const reasonHtml = params.reason ? `<p>Lý do: ${params.reason}</p>` : '';
    const html = `<p>Chào ${params.ownerName}, chi nhánh "${params.venueName}" của bạn đã bị từ chối.</p>${reasonHtml}`;
    return this.sendSafely(params.to, 'Chi nhánh đã bị từ chối', html);
  }

  notifyDisputeRejected(params: DisputeRejectionParams): Promise<void> {
    const reasonHtml = params.reason ? `<p>Lý do: ${params.reason}</p>` : '';
    const html = `<p>Chào ${params.customerName}, khiếu nại của bạn về một booking đã bị từ chối.</p>${reasonHtml}`;
    return this.sendSafely(params.to, 'Khiếu nại của bạn đã bị từ chối', html);
  }

  notifyBookingCancelledForOwner(params: BookingCancelledForOwnerParams): Promise<void> {
    const html = `<p>Booking sau đã bị khách hàng huỷ:<br/>
Sân: ${params.courtName} - ${params.venueName}<br/>
Ngày: ${params.date}, ${params.startTime} - ${params.endTime}</p>`;
    return this.sendSafely(params.to, 'Khách hàng đã huỷ booking', html);
  }

  notifyPaymentConfirmedForOwner(params: PaymentConfirmedForOwnerParams): Promise<void> {
    const html = `<p>Bạn vừa nhận thanh toán cho booking:<br/>
Sân: ${params.courtName} - ${params.venueName}<br/>
Ngày: ${params.date}, ${params.startTime} - ${params.endTime}<br/>
Số tiền: ${currencyFormatter.format(params.totalPrice)} đ</p>`;
    return this.sendSafely(params.to, 'Đã nhận thanh toán', html);
  }

  notifyDailyReport(params: DailyReportParams): Promise<void> {
    const html = `<p>Báo cáo hôm nay:<br/>
Số lượt đặt sân: ${params.bookingsCount}<br/>
Doanh thu: ${currencyFormatter.format(params.revenue)} đ</p>`;
    return this.sendSafely(params.to, 'Báo cáo ngày', html);
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
