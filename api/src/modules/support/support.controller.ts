import {
  Body, Controller, Get, MaxFileSizeValidator, Param, ParseFilePipe, Patch, Post, Query,
  UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { SupportService } from './support.service';
import { UploadsService } from '../uploads/uploads.service';
import { OptionalJwtAuthGuard } from '../../auth/guards/optional-jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@Controller('support')
export class SupportController {
  constructor(
    private readonly service: SupportService,
    private readonly uploads: UploadsService,
  ) {}

  // Chat — accessible aux usagers connectés ET anonymes (session_id généré
  // côté client, conservé en localStorage pour garder le fil).
  @Get('chat/history')
  @UseGuards(OptionalJwtAuthGuard)
  getHistory(@Query('sessionId') sessionId: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.service.getHistory(user?.userId ?? null, user ? null : sessionId);
  }

  @Post('chat/message')
  @UseGuards(OptionalJwtAuthGuard)
  sendMessage(
    @Body() dto: { sessionId?: string; email?: string; message: string },
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.service.sendMessage(user?.userId ?? null, user ? null : dto.sessionId ?? null, user?.email ?? dto.email ?? null, dto.message);
  }

  // Ferme la conversation active — « Réinitialiser le chat ».
  @Post('chat/reset')
  @UseGuards(OptionalJwtAuthGuard)
  resetConversation(@Body() dto: { sessionId?: string }, @CurrentUser() user?: CurrentUserPayload) {
    return this.service.resetConversation(user?.userId ?? null, user ? null : dto.sessionId ?? null);
  }

  // Marque la conversation comme vue — fait taire le flash de l'icône Aide.
  @Post('chat/seen')
  @UseGuards(OptionalJwtAuthGuard)
  markConversationSeen(@Body() dto: { sessionId?: string }, @CurrentUser() user?: CurrentUserPayload) {
    return this.service.markConversationSeen(user?.userId ?? null, user ? null : dto.sessionId ?? null);
  }

  // Appelé après confirmation explicite dans le chat ("Oui, créer un
  // ticket") — prépare seulement un sujet/description suggérés, ne crée
  // rien. Le frontend redirige ensuite vers le formulaire complet dans
  // « Billets de support », pré-rempli avec cette suggestion.
  @Post('chat/prepare-ticket')
  @UseGuards(OptionalJwtAuthGuard)
  prepareTicketFromChat(
    @Body() dto: { sessionId?: string },
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.service.prepareTicketFromChat(user?.userId ?? null, user ? null : dto.sessionId ?? null);
  }

  // Ticket créé via le formulaire complet (direct, ou pré-rempli depuis le
  // chat) — avec pièces jointes optionnelles (déjà téléversées au préalable).
  @Post('tickets')
  @UseGuards(OptionalJwtAuthGuard)
  createTicket(
    @Body() dto: { email: string; name?: string; subject: string; description: string; attachments?: { url: string; filename: string }[] },
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.service.createManualTicket(user?.userId ?? null, dto.email, dto.name, dto.subject, dto.description, dto.attachments);
  }

  // « Mes billets » — réservé aux comptes connectés.
  @Get('tickets/mine')
  @UseGuards(JwtAuthGuard)
  findMyTickets(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findMyTickets(user.userId);
  }

  @Get('tickets/mine/:id')
  @UseGuards(JwtAuthGuard)
  findMyTicketDetail(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.findMyTicketDetail(id, user.userId);
  }

  @Post('tickets/mine/:id/seen')
  @UseGuards(JwtAuthGuard)
  markTicketSeen(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.markTicketSeen(id, user.userId);
  }

  @Post('tickets/mine/:id/close')
  @UseGuards(JwtAuthGuard)
  closeOwnTicket(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.closeOwnTicket(id, user.userId);
  }

  // Un seul appel : est-ce que l'icône Aide doit flasher (réponse non lue,
  // billet ou chat)?
  @Get('unread-status')
  @UseGuards(OptionalJwtAuthGuard)
  getUnreadStatus(@Query('sessionId') sessionId: string, @CurrentUser() user?: CurrentUserPayload) {
    return this.service.getUnreadStatus(user?.userId ?? null, user ? null : sessionId);
  }

  // Téléversement d'une pièce jointe — accessible aux usagers connectés ET
  // anonymes (le formulaire de billet peut être rempli sans compte).
  @Post('attachments')
  @UseGuards(OptionalJwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  uploadAttachment(
    @UploadedFile(
      new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize: 8 * 1024 * 1024 })] }),
    )
    file: Express.Multer.File,
  ) {
    return this.uploads.uploadGenericFile('support-attachments', file);
  }

  // ---------- Admin ----------

  @Get('admin/tickets')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  findAllTickets(@Query('status') status?: string) {
    return this.service.findAllTickets(status);
  }

  @Get('admin/tickets/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  findTicketDetail(@Param('id') id: string) {
    return this.service.findTicketDetail(id);
  }

  @Post('admin/tickets/:id/reply')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  replyToTicket(@Param('id') id: string, @Body('message') message: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.replyToTicket(id, user.userId, message);
  }

  @Patch('admin/tickets/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  updateStatus(@Param('id') id: string, @Body('status') status: 'open' | 'in_progress' | 'resolved') {
    return this.service.updateTicketStatus(id, status);
  }
}
