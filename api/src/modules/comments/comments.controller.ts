import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { CommentsService } from './comments.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';

@Controller('reports/:reportId/comments')
export class CommentsController {
  constructor(private readonly service: CommentsService) {}

  @Get()
  findForReport(@Param('reportId') reportId: string) {
    return this.service.findForReport(reportId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(
    @Param('reportId') reportId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() dto: CreateCommentDto,
  ) {
    return this.service.create(reportId, user.userId, dto.message, dto.parentCommentId);
  }

  @Patch(':commentId/hide')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('moderator', 'admin', 'super_admin')
  hide(@Param('commentId') commentId: string) {
    return this.service.hide(commentId);
  }
}
