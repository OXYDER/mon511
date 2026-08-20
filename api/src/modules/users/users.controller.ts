import {
  Body, Controller, Get, MaxFileSizeValidator, Param, ParseFilePipe, FileTypeValidator,
  Patch, Post, Query, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UsersService } from './users.service';
import { UploadsService } from '../uploads/uploads.service';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';

@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly uploads: UploadsService,
  ) {}

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

  @Post('me/tutorial/complete')
  @UseGuards(JwtAuthGuard)
  completeTutorial(@CurrentUser() user: CurrentUserPayload) {
    return this.usersService.completeTutorial(user.userId);
  }

  @Post('me/tutorial/restart')
  @UseGuards(JwtAuthGuard)
  restartTutorial(@CurrentUser() user: CurrentUserPayload) {
    return this.usersService.restartTutorial(user.userId);
  }

  @Patch('me/profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(@CurrentUser() user: CurrentUserPayload, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.userId, dto);
  }

  @Post('me/avatar')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadAvatar(
    @CurrentUser() user: CurrentUserPayload,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 4 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    const { url } = await this.uploads.uploadGenericFile('avatars', file);
    return this.usersService.setAvatarUrl(user.userId, url);
  }

  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  requestPasswordChange(@CurrentUser() user: CurrentUserPayload, @Body() dto: ChangePasswordDto) {
    return this.usersService.requestPasswordChange(user.userId, dto);
  }

  @Post('me/password/confirm')
  @UseGuards(JwtAuthGuard)
  confirmPasswordChange(@CurrentUser() user: CurrentUserPayload, @Body('code') code: string) {
    return this.usersService.confirmPasswordChange(user.userId, code);
  }

  @Patch('me/email')
  @UseGuards(JwtAuthGuard)
  requestEmailChange(@CurrentUser() user: CurrentUserPayload, @Body('newEmail') newEmail: string) {
    return this.usersService.requestEmailChange(user.userId, newEmail);
  }

  @Post('me/email/confirm')
  @UseGuards(JwtAuthGuard)
  confirmEmailChange(@CurrentUser() user: CurrentUserPayload, @Body('newEmail') newEmail: string, @Body('code') code: string) {
    return this.usersService.confirmEmailChange(user.userId, newEmail, code);
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

  @Patch('admin/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  adminUpdateUser(
    @Param('id') id: string,
    @Body() changes: { firstName?: string; lastName?: string; email?: string; addressText?: string },
  ) {
    return this.usersService.adminUpdateUser(id, changes);
  }

  @Patch('admin/:id/role')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('super_admin')
  setRole(@Param('id') id: string, @Body('role') role: string) {
    return this.usersService.setRole(id, role);
  }
}
