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

  @Get('flags')
  flags() {
    return this.moderationService.findFlaggedReports();
  }

  @Patch('flags/:reportId/dismiss')
  dismissFlags(@Param('reportId') reportId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.moderationService.dismissFlags(reportId, user.userId);
  }

  @Patch('flags/:reportId/remove')
  removeForAbuse(
    @Param('reportId') reportId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body('reason') reason: string,
  ) {
    return this.moderationService.removeReportForAbuse(reportId, user.userId, reason);
  }

  @Get('resolution-suggestions')
  resolutionSuggestions() {
    return this.moderationService.findPendingResolutionSuggestions();
  }

  @Patch('resolution-suggestions/:reportId/accept')
  acceptResolution(@Param('reportId') reportId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.moderationService.acceptResolution(reportId, user.userId);
  }

  @Patch('resolution-suggestions/:reportId/dismiss')
  dismissResolution(@Param('reportId') reportId: string) {
    return this.moderationService.dismissResolution(reportId);
  }

  @Get(':id')
  detail(@Param('id') id: string) {
    return this.moderationService.findDetail(id);
  }

  @Patch(':id/region')
  setRegion(@Param('id') id: string, @Body('regionId') regionId: string | null) {
    return this.moderationService.setRegion(id, regionId);
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
