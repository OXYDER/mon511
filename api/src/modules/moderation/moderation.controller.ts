import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ModerationService } from './moderation.service';
import { ModerationDecisionDto, ReplyMessageDto } from './dto/moderation-decision.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';

@Controller('moderation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('moderator', 'admin', 'super_admin')
export class ModerationController {
  constructor(private readonly moderationService: ModerationService) {}

  @Get('queue')
  queue(@Query('regionId') regionId?: string) {
    return this.moderationService.findQueue(regionId);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.moderationService.findDetail(id);
  }

  @Patch(':id/decision')
  decide(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ModerationDecisionDto,
  ) {
    return this.moderationService.decide(id, user.userId, dto);
  }

  @Post(':id/reply')
  reply(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: ReplyMessageDto,
  ) {
    return this.moderationService.reply(id, user.userId, 'moderator', dto.message);
  }
}
