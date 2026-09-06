import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CourtsModule } from '../courts/courts.module';
import { Court } from '../courts/entities/court.entity';
import { Payment } from '../payments/entities/payment.entity';
import { PageViewsModule } from '../page-views/page-views.module';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';

@Module({
  imports: [CourtsModule, TypeOrmModule.forFeature([Court, Payment]), PageViewsModule],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
