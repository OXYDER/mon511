import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { StartConversationDto, SendMessageDto } from './dto/messaging.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';

@Controller('messaging')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(private readonly service: MessagingService) {}

  @Get('conversations')
  myConversations(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findMyConversations(user.userId);
  }

  @Get('unread-count')
  unreadCount(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getUnreadCount(user.userId);
  }

  @Get('conversations/:id/messages')
  messages(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findMessages(id, user.userId);
  }

  @Post('conversations')
  start(@CurrentUser() user: CurrentUserPayload, @Body() dto: StartConversationDto) {
    return this.service.startConversation(user.userId, dto.toUserId, dto.message);
  }

  @Post('conversations/:id/messages')
  send(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SendMessageDto,
  ) {
    return this.service.sendMessage(id, user.userId, dto.message);
  }

  @Post('block/:userId')
  block(@Param('userId') blockedId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.blockUser(user.userId, blockedId);
  }

  @Post('messages/:id/flag')
  flagMessage(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Body('reason') reason?: string) {
    return this.service.flagMessage(id, user.userId, reason);
  }

  @Get('admin/flagged')
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin', 'super_admin')
  findFlaggedMessages() {
    return this.service.findFlaggedMessages();
  }

  @Post('admin/flags/:id/dismiss')
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin', 'super_admin')
  dismissFlag(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.dismissMessageFlag(id, user.userId);
  }

  @Post('admin/flags/:id/remove-and-ban')
  @UseGuards(RolesGuard)
  @Roles('admin', 'super_admin')
  removeAndBan(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.removeMessageAndBanSender(id, user.userId);
  }
}
