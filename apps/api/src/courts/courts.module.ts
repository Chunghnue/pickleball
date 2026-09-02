import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Venue } from './entities/venue.entity';
import { VenueImage } from './entities/venue-image.entity';
import { Court } from './entities/court.entity';
import { CourtImage } from './entities/court-image.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { VenueSlugHistory } from './entities/venue-slug-history.entity';
import { Payment } from '../payments/entities/payment.entity';
import { VenuesService } from './venues.service';
import { CourtsService } from './courts.service';
import { VenuesController } from './venues.controller';
import { CourtsController } from './courts.controller';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { PricingModule } from '../pricing/pricing.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Venue, VenueImage, Court, CourtImage, Booking, VenueSlugHistory, Payment]),
    UsersModule,
    NotificationsModule,
    PricingModule,
  ],
  controllers: [VenuesController, CourtsController],
  providers: [VenuesService, CourtsService],
  exports: [VenuesService, CourtsService],
})
export class CourtsModule {}
