import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReputationModule } from '../reputation/reputation.module';
import { MunicipalPortalModule } from '../municipal-portal/municipal-portal.module';

@Module({
  imports: [NotificationsModule, ReputationModule, MunicipalPortalModule],
  controllers: [ReportsController],
  providers: [ReportsService],
  exports: [ReportsService],
})
export class ReportsModule {}
