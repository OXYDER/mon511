import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { MessagingService } from './messaging.service';
import { StartConversationDto, SendMessageDto } from './dto/messaging.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';

@Controller('messaging')
@UseGuards(JwtAuthGuard)
export class MessagingController {
  constructor(private readonly service: MessagingService) {}

  @Get('conversations')
  myConversations(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findMyConversations(user.userId);
  }

  @Get('conversations/:id/messages')
  messages(@Param('id') id: string) {
    return this.service.findMessages(id);
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
}
