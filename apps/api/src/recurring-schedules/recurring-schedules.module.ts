import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { RecurringSchedule } from './entities/recurring-schedule.entity';
import { RecurringSchedulesService } from './recurring-schedules.service';
import { RecurringSchedulesController } from './recurring-schedules.controller';
import { CourtsModule } from '../courts/courts.module';
import { CustomerContactsModule } from '../customer-contacts/customer-contacts.module';
import { BookingsModule } from '../bookings/bookings.module';
import { User } from '../users/entities/user.entity';
import { CustomerContact } from '../customer-contacts/entities/customer-contact.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([RecurringSchedule, User, CustomerContact]),
    CourtsModule,
    CustomerContactsModule,
    BookingsModule,
  ],
  controllers: [RecurringSchedulesController],
  providers: [RecurringSchedulesService],
})
export class RecurringSchedulesModule {}
