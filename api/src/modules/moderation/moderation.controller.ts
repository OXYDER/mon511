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

  @Get('all-reports')
  allReports(
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('sortBy') sortBy?: 'created_at' | 'municipality',
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('limit') limit = '30',
    @Query('offset') offset = '0',
  ) {
    return this.moderationService.findAllReports({
      search, status, sortBy, sortDir, limit: Number(limit), offset: Number(offset),
    });
  }

  @Patch('all-reports/:id')
  @Roles('admin', 'super_admin')
  adminUpdateReport(
    @Param('id') id: string,
    @Body() changes: { description?: string; addressText?: string; problemTypeId?: string; status?: string },
  ) {
    return this.moderationService.adminUpdateReport(id, changes);
  }

  @Post('all-reports/:id/delete')
  @Roles('admin', 'super_admin')
  adminDeleteReport(@Param('id') id: string) {
    return this.moderationService.adminDeleteReport(id);
  }

  @Post('all-reports/bulk-delete')
  @Roles('admin', 'super_admin')
  adminDeleteReportsBulk(@Body('ids') ids: string[]) {
    return this.moderationService.adminDeleteReportsBulk(ids);
  }

  @Post('all-reports/photos/:photoId/delete')
  @Roles('admin', 'super_admin')
  adminDeletePhoto(@Param('photoId') photoId: string) {
    return this.moderationService.adminDeletePhoto(photoId);
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
