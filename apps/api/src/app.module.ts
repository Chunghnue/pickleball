import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { AppController } from './app.controller';
import { UsersModule } from './users/users.module';
import { MailModule } from './mail/mail.module';
import { AuthModule } from './auth/auth.module';
import { AdminModule } from './admin/admin.module';
import { CourtsModule } from './courts/courts.module';
import { BookingsModule } from './bookings/bookings.module';
import { PaymentsModule } from './payments/payments.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DisputesModule } from './disputes/disputes.module';
import { CustomerContactsModule } from './customer-contacts/customer-contacts.module';
import { CustomersModule } from './customers/customers.module';
import { RecurringSchedulesModule } from './recurring-schedules/recurring-schedules.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60000, limit: 20 }]),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres' as const,
        host: config.get<string>('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5433),
        username: config.get<string>('DB_USERNAME', 'pickleball'),
        password: config.get<string>('DB_PASSWORD', 'pickleball'),
        database: config.get<string>('DB_NAME', 'pickleball'),
        autoLoadEntities: true,
        synchronize: false,
      }),
    }),
    UsersModule,
    MailModule,
    AuthModule,
    AdminModule,
    CourtsModule,
    BookingsModule,
    PaymentsModule,
    DashboardModule,
    NotificationsModule,
    DisputesModule,
    CustomerContactsModule,
    CustomersModule,
    RecurringSchedulesModule,
  ],
  controllers: [AppController],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
