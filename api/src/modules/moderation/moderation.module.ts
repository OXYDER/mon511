import { Module } from '@nestjs/common';
import { ModerationController } from './moderation.controller';
import { ModerationService } from './moderation.service';
import { MunicipalityIntegrationsModule } from '../municipality-integrations/municipality-integrations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { ReputationModule } from '../reputation/reputation.module';

@Module({
  imports: [MunicipalityIntegrationsModule, NotificationsModule, ReputationModule],
  controllers: [ModerationController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
