import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { NotificationSettingsService } from './notification-settings.service';
import { UsersService } from '../users/users.service';
import { VenuesService } from '../courts/venues.service';
import { DashboardService } from '../dashboard/dashboard.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class DailyReportScheduler {
  constructor(
    private readonly notificationSettingsService: NotificationSettingsService,
    private readonly usersService: UsersService,
    private readonly venuesService: VenuesService,
    private readonly dashboardService: DashboardService,
    private readonly notificationsService: NotificationsService,
  ) {}

  @Cron('0 23 * * *')
  async sendDailyReports(): Promise<void> {
    const owners = await this.usersService.findActiveOwners();
    for (const owner of owners) {
      const settings = await this.notificationSettingsService.getForOwner(owner.id);
      if (!settings.dailyReport) {
        continue;
      }
      const venues = await this.venuesService.findMineByOwner(owner.id);
      if (venues.length === 0) {
        continue;
      }
      const summary = await this.dashboardService.getSummary(owner.id);
      await this.notificationsService.notifyDailyReport({
        to: owner.email ?? '',
        bookingsCount: summary.todayBookingsCount,
        revenue: summary.todayRevenue,
      });
    }
  }
}
