import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Venue } from './entities/venue.entity';
import { VenueImage } from './entities/venue-image.entity';
import { Court } from './entities/court.entity';
import { VenuesService } from './venues.service';
import { CourtsService } from './courts.service';
import { VenuesController } from './venues.controller';
import { CourtsController } from './courts.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Venue, VenueImage, Court])],
  controllers: [VenuesController, CourtsController],
  providers: [VenuesService, CourtsService],
  exports: [VenuesService, CourtsService],
})
export class CourtsModule {}
