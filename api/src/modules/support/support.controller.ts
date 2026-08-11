import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { SupportService } from './support.service';
import { OptionalJwtAuthGuard } from '../../auth/guards/optional-jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@Controller('support')
export class SupportController {
  constructor(private readonly service: SupportService) {}

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

  // Ticket créé manuellement (formulaire de contact direct).
  @Post('tickets')
  @UseGuards(OptionalJwtAuthGuard)
  createTicket(
    @Body() dto: { email: string; name?: string; subject: string; description: string },
    @CurrentUser() user?: CurrentUserPayload,
  ) {
    return this.service.createManualTicket(user?.userId ?? null, dto.email, dto.name, dto.subject, dto.description);
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
