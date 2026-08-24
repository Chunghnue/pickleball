import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { CourtsModule } from '../courts/courts.module';
import { AdminController } from './admin.controller';
import { AdminVenuesController } from './admin-venues.controller';

@Module({
  imports: [UsersModule, CourtsModule],
  controllers: [AdminController, AdminVenuesController],
})
export class AdminModule {}
