import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CustomerContact } from './entities/customer-contact.entity';
import { CustomerContactsService } from './customer-contacts.service';
import { CustomerContactsController } from './customer-contacts.controller';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [TypeOrmModule.forFeature([CustomerContact]), UsersModule],
  controllers: [CustomerContactsController],
  providers: [CustomerContactsService],
  exports: [CustomerContactsService],
})
export class CustomerContactsModule {}
