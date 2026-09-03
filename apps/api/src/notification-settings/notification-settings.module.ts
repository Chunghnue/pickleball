import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NotificationSettings } from './entities/notification-settings.entity';
import { NotificationSettingsService } from './notification-settings.service';
import { NotificationSettingsController } from './notification-settings.controller';
import { DailyReportScheduler } from './daily-report.scheduler';
import { UsersModule } from '../users/users.module';
import { CourtsModule } from '../courts/courts.module';
import { DashboardModule } from '../dashboard/dashboard.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationSettings]),
    UsersModule,
    CourtsModule,
    DashboardModule,
    NotificationsModule,
  ],
  controllers: [NotificationSettingsController],
  providers: [NotificationSettingsService, DailyReportScheduler],
  exports: [NotificationSettingsService],
})
export class NotificationSettingsModule {}
