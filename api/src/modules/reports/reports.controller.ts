import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, Optional } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { CreateReportDto } from './dto/create-report.dto';
import { SuggestResolutionDto } from './dto/suggest-resolution.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { OptionalJwtAuthGuard } from '../../auth/guards/optional-jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';

@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('nearby')
  @UseGuards(OptionalJwtAuthGuard)
  findNearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius = '5000',
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.reportsService.findNearby(Number(lat), Number(lng), Number(radius), user?.userId);
  }

  // Confirmation via le lien reçu par courriel — publique (pas de connexion
  // requise, le jeton lui-même prouve l'identité). Doit être déclarée avant
  // ':id' pour ne jamais être interceptée par la route paramétrée.
  @Post('confirm-via-token/:token')
  confirmViaToken(@Param('token') token: string) {
    return this.reportsService.confirmViaToken(token);
  }

  // Idem — recherche d'archives à proximité pour la détection de doublons
  // à la création d'un signalement.
  @Get('nearby-archived')
  findNearbyArchived(@Query('lat') lat: string, @Query('lng') lng: string) {
    return this.reportsService.findNearbyArchived(Number(lat), Number(lng));
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.reportsService.findOne(id);
  }

  // Signalement anonyme autorisé si site_settings.allow_anonymous_reports = true —
  // pour le MVP, JwtAuthGuard reste optionnel via @Optional côté guard custom si besoin;
  // ici on exige la connexion, à assouplir une fois ce réglage câblé côté middleware.
  @Post()
  @UseGuards(JwtAuthGuard)
  create(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreateReportDto) {
    return this.reportsService.create(user.userId, dto);
  }

  @Post(':id/suggest-resolution')
  @UseGuards(JwtAuthGuard)
  suggestResolution(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: SuggestResolutionDto,
  ) {
    return this.reportsService.suggestResolution(id, user.userId, dto.comment);
  }

  @Post(':id/confirm')
  @UseGuards(JwtAuthGuard)
  confirm(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.reportsService.confirm(id, user.userId);
  }

  @Post(':id/flag')
  @UseGuards(JwtAuthGuard)
  flag(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body('reason') reason: string,
    @Body('notes') notes?: string,
  ) {
    return this.reportsService.flag(id, user.userId, reason, notes);
  }

  @Get(':id/owner-detail')
  @UseGuards(JwtAuthGuard)
  ownerDetail(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.reportsService.findOwnDetail(id, user.userId);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  updateOwn(
    @Param('id') id: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() changes: { description?: string; addressText?: string; municipalityNotified?: 'yes' | 'no' | 'unknown'; municipalityName?: string; problemTypeId?: string },
  ) {
    return this.reportsService.updateOwn(id, user.userId, changes);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  withdrawOwn(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.reportsService.withdrawOwn(id, user.userId);
  }

  @Delete(':id/photos/:photoId')
  @UseGuards(JwtAuthGuard)
  deleteOwnPhoto(@Param('id') id: string, @Param('photoId') photoId: string, @CurrentUser() user: CurrentUserPayload) {
    return this.reportsService.deleteOwnPhoto(id, photoId, user.userId);
  }
}
