import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotificationSettings } from './entities/notification-settings.entity';
import { UpdateNotificationSettingsDto } from './dto/update-notification-settings.dto';

export interface NotificationSettingsView {
  newBooking: boolean;
  cancellation: boolean;
  payment: boolean;
  dailyReport: boolean;
}

const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettingsView = {
  newBooking: true,
  cancellation: true,
  payment: true,
  dailyReport: true,
};

@Injectable()
export class NotificationSettingsService {
  constructor(
    @InjectRepository(NotificationSettings)
    private readonly repository: Repository<NotificationSettings>,
  ) {}

  async getForOwner(ownerId: string): Promise<NotificationSettingsView> {
    const row = await this.repository.findOne({ where: { ownerId } });
    if (!row) {
      return { ...DEFAULT_NOTIFICATION_SETTINGS };
    }
    return {
      newBooking: row.newBooking,
      cancellation: row.cancellation,
      payment: row.payment,
      dailyReport: row.dailyReport,
    };
  }

  async update(
    ownerId: string,
    dto: UpdateNotificationSettingsDto,
  ): Promise<NotificationSettingsView> {
    let row = await this.repository.findOne({ where: { ownerId } });
    if (!row) {
      row = this.repository.create({ ownerId, ...DEFAULT_NOTIFICATION_SETTINGS });
    }
    if (dto.newBooking !== undefined) row.newBooking = dto.newBooking;
    if (dto.cancellation !== undefined) row.cancellation = dto.cancellation;
    if (dto.payment !== undefined) row.payment = dto.payment;
    if (dto.dailyReport !== undefined) row.dailyReport = dto.dailyReport;
    const saved = await this.repository.save(row);
    return {
      newBooking: saved.newBooking,
      cancellation: saved.cancellation,
      payment: saved.payment,
      dailyReport: saved.dailyReport,
    };
  }
}
