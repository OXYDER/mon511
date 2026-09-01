import {
  Body, Controller, Get, Header, Param, Patch, Post, Query, Res, UseGuards, UseInterceptors,
  UploadedFile, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { MunicipalPortalService } from './municipal-portal.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';

@Controller('municipal-portal')
export class MunicipalPortalController {
  constructor(private readonly service: MunicipalPortalService) {}

  // ---------- Demande d'accès (tout usager connecté) ----------

  @Get('search-regions')
  @UseGuards(JwtAuthGuard)
  searchRegions(@Query('search') search: string) {
    return this.service.searchRegions(search);
  }

  @Get('my-access-status')
  @UseGuards(JwtAuthGuard)
  getMyAccessStatus(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getMyAccessStatus(user.userId);
  }

  @Get('public/:regionId')
  @UseGuards(JwtAuthGuard)
  findPublicMunicipalityPage(@Param('regionId') regionId: string) {
    return this.service.findPublicMunicipalityPage(regionId);
  }

  @Post('request-access')
  @UseGuards(JwtAuthGuard)
  requestAccess(
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: { regionId: string; jobTitle: string; message?: string },
  ) {
    return this.service.requestAccess(user.userId, dto.regionId, dto.jobTitle, dto.message);
  }

  @Get('my-access-status')
  @UseGuards(JwtAuthGuard)
  findMyAccessStatus(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findMyAccessStatus(user.userId);
  }

  // ---------- Admin mon511 (approbation des demandes) ----------

  @Get('admin/access-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  findPendingAccessRequests() {
    return this.service.findPendingAccessRequests(null);
  }

  @Post('admin/access-requests/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  approveAccessRequest(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.approveAccessRequest(id, user.userId, true);
  }

  @Post('admin/access-requests/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  rejectAccessRequest(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.rejectAccessRequest(id, user.userId, true);
  }

  // ---------- Auto-gestion municipale (municipal_admin, sans passer par
  // un admin du site) — le premier membre approuvé pour une municipalité
  // devient automatiquement municipal_admin (voir requestAccess), et peut
  // ensuite gérer lui-même ses propres modérateurs et le contenu de sa
  // municipalité. ----------

  @Post('my-region/logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_admin')
  @UseInterceptors(FileInterceptor('file'))
  uploadMyRegionLogo(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 3 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp|svg)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.service.uploadMyRegionLogo(user.userId, file);
  }

  @Post('admin/regions/:regionId/logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  @UseInterceptors(FileInterceptor('file'))
  uploadRegionLogo(
    @Param('regionId') regionId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 3 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp|svg)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.service.uploadLogoForRegion(regionId, file);
  }

  @Get('my-region/access-requests')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_admin')
  findMyRegionAccessRequests(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findPendingAccessRequestsForReviewer(user.userId);
  }

  @Post('my-region/access-requests/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_admin')
  approveMyRegionAccessRequest(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.approveAccessRequest(id, user.userId, false);
  }

  @Post('my-region/access-requests/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_admin')
  rejectMyRegionAccessRequest(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.rejectAccessRequest(id, user.userId, false);
  }

  @Get('my-region/dashboard')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  getMyRegionDashboard(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getMyRegionDashboard(user.userId);
  }

  @Get('my-region/reports/queue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  findMyRegionReportsQueue(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findMyRegionReportsQueue(user.userId);
  }

  @Post('my-region/reports/:id/resolve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  resolveMyRegionReport(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.resolveReportInMyRegion(user.userId, id);
  }

  @Post('my-region/reports/:id/flag-false')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  flagMyRegionReportAsFalse(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Body('reason') reason?: string) {
    return this.service.rejectReportInMyRegion(user.userId, id, reason);
  }

  // ---------- Statistiques du rapport périodique ----------

  @Get('my-region/report/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  async myRegionReportStats(@CurrentUser() user: CurrentUserPayload, @Query('days') days?: string) {
    const periodEnd = new Date();
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - (Number(days) || 30));
    return this.service.computeMyRegionReportStats(user.userId, periodStart, periodEnd);
  }

  @Get('admin/regions/:regionId/report/stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  async regionReportStats(@Param('regionId') regionId: string, @Query('days') days?: string) {
    const periodEnd = new Date();
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - (Number(days) || 30));
    return this.service.computeReportStats(regionId, periodStart, periodEnd);
  }

  @Get('my-region/report/settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  getMyRegionReportSettings(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getMyRegionReportSettings(user.userId);
  }

  @Patch('my-region/report/settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_admin')
  updateMyRegionReportSettings(@CurrentUser() user: CurrentUserPayload, @Body() body: { enabled: boolean; frequency: 'weekly' | 'monthly'; enabledStats: string[] }) {
    return this.service.updateMyRegionReportSettings(user.userId, body.enabled, body.frequency, body.enabledStats);
  }

  @Get('admin/regions/:regionId/report/settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  getRegionReportSettings(@Param('regionId') regionId: string) {
    return this.service.getReportSettingsForRegion(regionId);
  }

  @Patch('admin/regions/:regionId/report/settings')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  updateRegionReportSettings(@Param('regionId') regionId: string, @Body() body: { enabled: boolean; frequency: 'weekly' | 'monthly'; enabledStats: string[] }) {
    return this.service.updateReportSettingsForRegion(regionId, body.enabled, body.frequency, body.enabledStats);
  }

  @Post('admin/regions/:regionId/report/test-send')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  sendTestReport(@Param('regionId') regionId: string, @Body('email') email: string) {
    return this.service.sendTestReportEmail(regionId, email);
  }

  @Get('my-region/posts/queue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  findMyRegionPostsQueue(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findMyRegionPostsQueue(user.userId);
  }

  @Post('my-region/posts/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  approveMyRegionPost(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.approvePostInMyRegion(user.userId, id);
  }

  @Post('my-region/posts/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  rejectMyRegionPost(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Body('reason') reason?: string) {
    return this.service.rejectPostInMyRegion(user.userId, id, reason);
  }

  @Get('admin/municipalities')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  findMunicipalitiesWithAccess() {
    return this.service.findMunicipalitiesWithAccess();
  }

  @Patch('admin/municipalities/:regionId/tier')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  setSubscriptionTier(
    @Param('regionId') regionId: string,
    @Body('tier') tier: 'free' | 'premium',
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.setSubscriptionTier(regionId, tier, user.userId);
  }

  // ---------- Portail (employés municipaux approuvés) ----------

  @Get('reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  findReports(
    @CurrentUser() user: CurrentUserPayload,
    @Query('status') status?: string,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    return this.service.findReports(user.userId, status, Number(limit), Number(offset));
  }

  @Patch('reports/:id/tracking')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  updateTracking(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: { internalStatus?: 'new' | 'acknowledged' | 'in_progress' | 'done'; assignedTo?: string; internalNotes?: string },
  ) {
    return this.service.updateTracking(user.userId, id, dto);
  }

  @Get('stats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  getStats(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getStats(user.userId);
  }

  @Get('comparatives')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  getComparatives(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getComparatives(user.userId);
  }

  @Get('export.csv')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(@CurrentUser() user: CurrentUserPayload, @Res() res: Response) {
    const csv = await this.service.exportCsv(user.userId);
    res.setHeader('Content-Disposition', 'attachment; filename="signalements-mon511.csv"');
    res.send('\uFEFF' + csv); // BOM pour un bon affichage des accents dans Excel
  }
}
