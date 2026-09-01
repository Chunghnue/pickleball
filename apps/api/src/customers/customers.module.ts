import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourtsModule } from '../courts/courts.module';
import { UsersModule } from '../users/users.module';
import { CustomerContactsModule } from '../customer-contacts/customer-contacts.module';
import { Court } from '../courts/entities/court.entity';
import { Booking } from '../bookings/entities/booking.entity';
import { CustomerContact } from '../customer-contacts/entities/customer-contact.entity';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [
    CourtsModule,
    UsersModule,
    CustomerContactsModule,
    TypeOrmModule.forFeature([Court, Booking, CustomerContact]),
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
})
export class CustomersModule {}
