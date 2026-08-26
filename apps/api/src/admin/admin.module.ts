import { Module } from '@nestjs/common';
import { UsersModule } from '../users/users.module';
import { CourtsModule } from '../courts/courts.module';
import { AdminController } from './admin.controller';
import { AdminVenuesController } from './admin-venues.controller';
import { AdminApprovalsController } from './admin-approvals.controller';
import { AdminApprovalsService } from './admin-approvals.service';

@Module({
  imports: [UsersModule, CourtsModule],
  controllers: [AdminController, AdminVenuesController, AdminApprovalsController],
  providers: [AdminApprovalsService],
})
export class AdminModule {}
