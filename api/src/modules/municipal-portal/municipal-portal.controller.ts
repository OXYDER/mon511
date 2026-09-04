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

  @Get('my-effective-permissions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  getMyEffectivePermissions(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getMyEffectivePermissions(user.userId);
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

  @Get('my-region/team')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  findMyRegionTeam(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findMyRegionTeam(user.userId);
  }

  @Post('my-region/team/:userId/remove')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_admin')
  removeMyRegionTeamMember(@Param('userId') targetUserId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.removeMyRegionTeamMember(user.userId, targetUserId);
  }

  @Patch('my-region/team/:userId/rank')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_admin')
  updateTeamMemberRank(@Param('userId') targetUserId: string, @CurrentUser() user: CurrentUserPayload, @Body('rank') rank: string) {
    return this.service.updateTeamMemberRank(user.userId, targetUserId, rank);
  }

  @Get('my-region/rank-permissions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  getMyRegionRankPermissions(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getMyRegionRankPermissions(user.userId);
  }

  @Patch('my-region/rank-permissions/:rank')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_admin')
  updateMyRegionRankPermissions(@Param('rank') rank: string, @CurrentUser() user: CurrentUserPayload, @Body() permissions: Record<string, boolean>) {
    return this.service.updateMyRegionRankPermissions(user.userId, rank, permissions);
  }

  @Post('my-region/invites')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_admin')
  createMyRegionInvite(@CurrentUser() user: CurrentUserPayload, @Body('rank') rank: string, @Body('email') email?: string) {
    return this.service.createMyRegionInvite(user.userId, rank, email);
  }

  @Get('my-region/invites')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_admin')
  findMyRegionPendingInvites(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findMyRegionPendingInvites(user.userId);
  }

  @Post('my-region/invites/:inviteId/cancel')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_admin')
  cancelMyRegionInvite(@Param('inviteId') inviteId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.cancelMyRegionInvite(user.userId, inviteId);
  }

  @Post('my-region/invites/:inviteId/resend')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_admin')
  resendMyRegionInvite(@Param('inviteId') inviteId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.resendMyRegionInvite(user.userId, inviteId);
  }

  @Get('invites/:token/preview')
  previewInvite(@Param('token') token: string) {
    return this.service.previewInvite(token);
  }

  @Post('invites/:token/redeem')
  @UseGuards(JwtAuthGuard)
  redeemInvite(@Param('token') token: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.redeemInvite(user.userId, token);
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

  @Get('my-region/to-process')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  findMyRegionToProcessQueue(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findMyRegionToProcessQueue(user.userId);
  }

  @Get('my-region/reports/queue')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  findMyRegionReportsQueue(@CurrentUser() user: CurrentUserPayload, @Query('search') search?: string, @Query('status') status?: string) {
    return this.service.findMyRegionReportsQueue(user.userId, search, status);
  }

  @Patch('my-region/incidents/:groupKey/report')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  updateIncidentReport(
    @Param('groupKey') groupKey: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: { description?: string; addressText?: string },
  ) {
    return this.service.updateIncidentReport(user.userId, groupKey, dto);
  }

  @Patch('my-region/incidents/:groupKey/public-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  setIncidentPublicStatus(
    @Param('groupKey') groupKey: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body('status') status: 'published_unresolved' | 'published_resolved',
  ) {
    return this.service.setIncidentPublicStatus(user.userId, groupKey, status);
  }

  @Get('my-region/incidents/:groupKey/reports')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  findIncidentReports(@Param('groupKey') groupKey: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findIncidentReports(user.userId, groupKey);
  }

  @Get('my-region/incidents/:groupKey/detail')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  findIncidentDetail(@Param('groupKey') groupKey: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findIncidentDetail(user.userId, groupKey);
  }

  @Patch('my-region/incidents/:groupKey/tracking')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  updateIncidentTracking(
    @Param('groupKey') groupKey: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: { internalStatus?: 'new' | 'acknowledged' | 'in_progress' | 'done'; assignedTo?: string; internalNotes?: string; publicNote?: string; publicNoteVisible?: boolean },
  ) {
    return this.service.updateIncidentTracking(user.userId, groupKey, dto);
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

  @Get('my-region/comparatives')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  myRegionComparatives(@CurrentUser() user: CurrentUserPayload) {
    return this.service.computeMyRegionComparatives(user.userId);
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

  @Get('my-region/executive-report')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  @Header('Content-Type', 'text/html; charset=utf-8')
  async getExecutiveReport(@CurrentUser() user: CurrentUserPayload, @Query('periodStart') periodStart: string, @Query('periodEnd') periodEnd: string, @Res() res: Response) {
    const start = periodStart ? new Date(periodStart) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const end = periodEnd ? new Date(periodEnd) : new Date();
    const html = await this.service.getExecutiveReportHtml(user.userId, start, end);
    res.send(html);
  }

  // ---------- Bons de travail (Interventions) ----------

  @Post('my-region/work-orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  createWorkOrder(@CurrentUser() user: CurrentUserPayload, @Body() dto: any) {
    return this.service.createWorkOrder(user.userId, dto);
  }

  @Get('my-region/work-orders')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  findMyRegionWorkOrders(@CurrentUser() user: CurrentUserPayload, @Query('status') status?: string, @Query('priority') priority?: string) {
    return this.service.findMyRegionWorkOrders(user.userId, status, priority);
  }

  @Get('my-region/work-orders/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  findWorkOrderDetail(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findWorkOrderDetail(user.userId, id);
  }

  @Patch('my-region/work-orders/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  updateWorkOrder(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Body() changes: Record<string, any>) {
    return this.service.updateWorkOrder(user.userId, id, changes);
  }

  @Post('my-region/work-orders/:id/delete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  deleteWorkOrder(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.deleteWorkOrder(user.userId, id);
  }

  @Post('my-region/work-orders/:id/tasks')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  addWorkOrderTask(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Body('description') description: string) {
    return this.service.addWorkOrderTask(user.userId, id, description);
  }

  @Post('my-region/work-order-tasks/:taskId/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  toggleWorkOrderTask(@Param('taskId') taskId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.toggleWorkOrderTask(user.userId, taskId);
  }

  @Post('my-region/work-order-tasks/:taskId/delete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  deleteWorkOrderTask(@Param('taskId') taskId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.deleteWorkOrderTask(user.userId, taskId);
  }

  @Post('my-region/work-orders/:id/photos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  @UseInterceptors(FileInterceptor('file'))
  uploadWorkOrderPhoto(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body('phase') phase: string,
    @UploadedFile(new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ })] })) file: Express.Multer.File,
  ) {
    return this.service.uploadWorkOrderPhoto(user.userId, id, phase, file);
  }

  // ---------- Entrepreneurs ----------

  @Get('my-region/contractors')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  findMyRegionContractors(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findMyRegionContractors(user.userId);
  }

  @Post('my-region/contractors')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  createMyRegionContractor(@CurrentUser() user: CurrentUserPayload, @Body() dto: any) {
    return this.service.createMyRegionContractor(user.userId, dto);
  }

  @Post('my-region/contractors/:contractorId/delete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  deleteMyRegionContractor(@Param('contractorId') contractorId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.deleteMyRegionContractor(user.userId, contractorId);
  }

  @Post('my-region/work-orders/:id/contractor')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  assignContractorToWorkOrder(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload, @Body('contractorId') contractorId: string | null) {
    return this.service.assignContractorToWorkOrder(user.userId, id, contractorId);
  }

  @Post('my-region/work-orders/:id/documents')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  @UseInterceptors(FileInterceptor('file'))
  uploadWorkOrderDocument(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body('documentType') documentType: string,
    @UploadedFile(new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 })] })) file: Express.Multer.File,
  ) {
    return this.service.uploadWorkOrderDocument(user.userId, id, documentType, file);
  }

  // ---------- Budget ----------

  @Get('my-region/budget')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  getMyRegionBudget(@CurrentUser() user: CurrentUserPayload, @Query('year') year: string) {
    return this.service.getMyRegionBudget(user.userId, year ? Number(year) : new Date().getFullYear());
  }

  @Post('my-region/budget')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  setMyRegionBudgetLine(@CurrentUser() user: CurrentUserPayload, @Body('year') year: number, @Body('category') category: string, @Body('plannedAmount') plannedAmount: number) {
    return this.service.setMyRegionBudgetLine(user.userId, year, category, plannedAmount);
  }

  @Post('my-region/budget/:lineId/delete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  deleteMyRegionBudgetLine(@Param('lineId') lineId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.deleteMyRegionBudgetLine(user.userId, lineId);
  }

  // ---------- Priorité automatique et SLA ----------

  @Post('my-region/incidents/:groupKey/priority/override')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  overrideIncidentPriority(@Param('groupKey') groupKey: string, @CurrentUser() user: CurrentUserPayload, @Body('priority') priority: string) {
    return this.service.overrideIncidentPriority(user.userId, groupKey, priority);
  }

  @Post('my-region/incidents/:groupKey/priority/reset')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  resetIncidentPriorityToAutomatic(@Param('groupKey') groupKey: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.resetIncidentPriorityToAutomatic(user.userId, groupKey);
  }

  @Post('admin/recompute-priorities')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  recomputeAllIncidentPriorities() {
    return this.service.recomputeAllIncidentPriorities();
  }

  @Get('my-region/sla-rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  getMyRegionSlaRules(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getMyRegionSlaRules(user.userId);
  }

  @Get('my-region/audit-log')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  findMyRegionAuditLog(@CurrentUser() user: CurrentUserPayload, @Query('targetType') targetType?: string) {
    return this.service.findMyRegionAuditLog(user.userId, targetType);
  }

  @Get('my-region/communication-templates')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  getMyRegionCommunicationTemplates(@CurrentUser() user: CurrentUserPayload) {
    return this.service.getMyRegionCommunicationTemplates(user.userId);
  }

  @Patch('my-region/communication-templates/:templateKey')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  setMyRegionCommunicationTemplate(@Param('templateKey') templateKey: string, @CurrentUser() user: CurrentUserPayload, @Body('body') body: string) {
    return this.service.setMyRegionCommunicationTemplate(user.userId, templateKey, body);
  }

  @Get('my-region/automation-rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  findMyRegionAutomationRules(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findMyRegionAutomationRules(user.userId);
  }

  @Post('my-region/automation-rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  createMyRegionAutomationRule(@CurrentUser() user: CurrentUserPayload, @Body() dto: any) {
    return this.service.createMyRegionAutomationRule(user.userId, dto);
  }

  @Post('my-region/automation-rules/:ruleId/toggle')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  toggleMyRegionAutomationRule(@Param('ruleId') ruleId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.toggleMyRegionAutomationRule(user.userId, ruleId);
  }

  @Post('my-region/automation-rules/:ruleId/delete')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  deleteMyRegionAutomationRule(@Param('ruleId') ruleId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.deleteMyRegionAutomationRule(user.userId, ruleId);
  }

  @Post('my-region/sla-rules')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('municipal_staff', 'municipal_admin')
  setMyRegionSlaRule(
    @CurrentUser() user: CurrentUserPayload,
    @Body('problemTypeId') problemTypeId: string | null,
    @Body('targetAcknowledgmentHours') targetAcknowledgmentHours: number,
    @Body('targetResolutionHours') targetResolutionHours: number,
  ) {
    return this.service.setMyRegionSlaRule(user.userId, problemTypeId, targetAcknowledgmentHours, targetResolutionHours);
  }
}
