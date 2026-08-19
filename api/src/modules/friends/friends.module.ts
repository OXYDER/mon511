import { Module } from '@nestjs/common';
import { FriendsController } from './friends.controller';
import { FriendsService } from './friends.service';
import { NotificationsModule } from '../notifications/notifications.module';
import { MessagingModule } from '../messaging/messaging.module';

@Module({
  imports: [NotificationsModule, MessagingModule],
  controllers: [FriendsController],
  providers: [FriendsService],
})
export class FriendsModule {}
