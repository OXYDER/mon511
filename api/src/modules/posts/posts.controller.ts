import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PostsService } from './posts.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';
import { CreatePostDto } from './dto/create-post.dto';
import { CreateCommentDto, RejectPostDto } from './dto/post-actions.dto';

@Controller('posts')
@UseGuards(JwtAuthGuard)
export class PostsController {
  constructor(private readonly service: PostsService) {}

  @Get()
  findFeed(@CurrentUser() user: CurrentUserPayload, @Query('category') category?: string) {
    return this.service.findFeed(user.userId, category);
  }

  @Get('mine')
  findMyPosts(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findMyPosts(user.userId);
  }

  @Post()
  createPost(@CurrentUser() user: CurrentUserPayload, @Body() dto: CreatePostDto) {
    return this.service.createPost(user.userId, dto);
  }

  @Post(':id/media')
  addMedia(
    @Param('id') postId: string,
    @CurrentUser() user: CurrentUserPayload,
    @Body() body: { url: string; mediaType: 'photo' | 'video'; orderIndex?: number },
  ) {
    return this.service.addMedia(postId, user.userId, body.url, body.mediaType, body.orderIndex ?? 0);
  }

  @Delete(':id')
  deletePost(@Param('id') postId: string, @CurrentUser() user: CurrentUserPayload) {
    const isModerator = ['moderator', 'admin', 'super_admin'].includes(user.role);
    return this.service.deletePost(postId, user.userId, isModerator);
  }

  @Get(':id/comments')
  findComments(@Param('id') postId: string) {
    return this.service.findComments(postId);
  }

  @Post(':id/comments')
  addComment(@Param('id') postId: string, @CurrentUser() user: CurrentUserPayload, @Body() dto: CreateCommentDto) {
    return this.service.addComment(postId, user.userId, dto.body);
  }

  @Post(':id/react')
  toggleReaction(@Param('id') postId: string, @CurrentUser() user: CurrentUserPayload, @Body('emoji') emoji: string) {
    return this.service.toggleReaction(postId, user.userId, emoji);
  }

  @Get('admin/queue')
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin', 'super_admin')
  findModerationQueue() {
    return this.service.findModerationQueue();
  }

  @Post('admin/:id/approve')
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin', 'super_admin')
  approvePost(@Param('id') postId: string) {
    return this.service.approvePost(postId);
  }

  @Post('admin/:id/reject')
  @UseGuards(RolesGuard)
  @Roles('moderator', 'admin', 'super_admin')
  rejectPost(@Param('id') postId: string, @Body() dto: RejectPostDto) {
    return this.service.rejectPost(postId, dto.reason);
  }
}
