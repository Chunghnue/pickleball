import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Booking } from './entities/booking.entity';
import { BookingSlot } from './entities/booking-slot.entity';
import { BookingsService } from './bookings.service';
import { BookingsController } from './bookings.controller';
import { CourtsModule } from '../courts/courts.module';

@Module({
  imports: [TypeOrmModule.forFeature([Booking, BookingSlot]), CourtsModule],
  controllers: [BookingsController],
  providers: [BookingsService],
  exports: [BookingsService],
})
export class BookingsModule {}
