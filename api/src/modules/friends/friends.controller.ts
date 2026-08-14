import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { FriendsService } from './friends.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';

@Controller('friends')
@UseGuards(JwtAuthGuard)
export class FriendsController {
  constructor(private readonly service: FriendsService) {}

  @Get()
  findMyFriends(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findMyFriends(user.userId);
  }

  @Get('requests/received')
  findPendingReceived(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findPendingReceived(user.userId);
  }

  @Get('requests/sent')
  findPendingSent(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findPendingSent(user.userId);
  }

  @Post('requests')
  sendRequest(@CurrentUser() user: CurrentUserPayload, @Body('email') email: string) {
    return this.service.sendRequest(user.userId, email);
  }

  @Post('requests/:id/accept')
  accept(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.respond(id, user.userId, true);
  }

  @Post('requests/:id/decline')
  decline(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.respond(id, user.userId, false);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @CurrentUser() user: CurrentUserPayload) {
    return this.service.remove(id, user.userId);
  }

  @Get('reports')
  findFriendsReports(@CurrentUser() user: CurrentUserPayload) {
    return this.service.findFriendsReports(user.userId);
  }
}
