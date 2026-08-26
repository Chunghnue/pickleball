import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersModule } from '../users/users.module';
import { CourtsModule } from '../courts/courts.module';
import { DisputesModule } from '../disputes/disputes.module';
import { User } from '../users/entities/user.entity';
import { Venue } from '../courts/entities/venue.entity';
import { Court } from '../courts/entities/court.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { Payment } from '../payments/entities/payment.entity';
import { AdminController } from './admin.controller';
import { AdminVenuesController } from './admin-venues.controller';
import { AdminApprovalsController } from './admin-approvals.controller';
import { AdminApprovalsService } from './admin-approvals.service';
import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsService } from './admin-stats.service';
import { AdminDisputesController } from './admin-disputes.controller';

@Module({
  imports: [
    UsersModule,
    CourtsModule,
    DisputesModule,
    TypeOrmModule.forFeature([User, Venue, Court, Booking, Payment]),
  ],
  controllers: [
    AdminController,
    AdminVenuesController,
    AdminApprovalsController,
    AdminStatsController,
    AdminDisputesController,
  ],
  providers: [AdminApprovalsService, AdminStatsService],
})
export class AdminModule {}
