import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Payment } from './entities/payment.entity';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { BookingsModule } from '../bookings/bookings.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { NotificationSettingsModule } from '../notification-settings/notification-settings.module';
import { CourtsModule } from '../courts/courts.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Payment]),
    forwardRef(() => BookingsModule),
    UsersModule,
    NotificationsModule,
    NotificationSettingsModule,
    CourtsModule,
  ],
  controllers: [PaymentsController],
  providers: [PaymentsService],
  exports: [PaymentsService],
})
export class PaymentsModule {}
