import { Body, Controller, Get, Header, Param, Patch, Post, Query, Res, UseGuards } from '@nestjs/common';
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
    return this.service.findPendingAccessRequests();
  }

  @Post('admin/access-requests/:id/approve')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  approveAccessRequest(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.approveAccessRequest(id, user.userId);
  }

  @Post('admin/access-requests/:id/reject')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  rejectAccessRequest(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.rejectAccessRequest(id, user.userId);
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
