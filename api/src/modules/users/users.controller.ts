import { Body, Controller, Get, Param, Patch, Query, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: CurrentUserPayload) {
    return this.usersService.findById(user.userId);
  }

  @Get('me/reports')
  @UseGuards(JwtAuthGuard)
  myReports(@CurrentUser() user: CurrentUserPayload) {
    return this.usersService.findMyReports(user.userId);
  }

  @Patch('me/privacy')
  @UseGuards(JwtAuthGuard)
  updatePrivacy(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdatePrivacyDto) {
    return this.usersService.updatePrivacySettings(user.userId, dto);
  }

  @Patch('me/map-layers')
  @UseGuards(JwtAuthGuard)
  updateMapLayers(
    @CurrentUser() user: CurrentUserPayload,
    @Body() prefs: Partial<{ travaux_routiers: boolean; conditions_hivernales: boolean }>,
  ) {
    return this.usersService.updateMapLayerPreferences(user.userId, prefs);
  }

  @Get(':id')
  publicProfile(@Param('id') id: string) {
    return this.usersService.findPublicProfile(id);
  }

  @Get('admin/all')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  findAllForAdmin(@Query('search') search?: string) {
    return this.usersService.findAllForAdmin(search);
  }

  @Patch('admin/:id/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  setStatus(@Param('id') id: string, @Body('status') status: 'active' | 'suspended' | 'banned') {
    return this.usersService.setStatus(id, status);
  }

  @Patch('admin/:id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  setRole(@Param('id') id: string, @Body('role') role: string) {
    return this.usersService.setRole(id, role);
  }
}
