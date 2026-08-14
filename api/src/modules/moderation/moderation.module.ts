import { Module } from '@nestjs/common';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { MunicipalityIntegrationsModule } from '../municipality-integrations/municipality-integrations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReputationModule } from '../reputation/reputation.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [MunicipalityIntegrationsModule, NotificationsModule, ReputationModule, UploadsModule],
  controllers: [ModerationController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
