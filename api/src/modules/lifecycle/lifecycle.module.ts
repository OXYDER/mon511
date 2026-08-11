import { Module } from '@nestjs/common';
import { LifecycleService } from './lifecycle.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [NotificationsModule, UploadsModule],
  providers: [LifecycleService],
})
export class LifecycleModule {}
