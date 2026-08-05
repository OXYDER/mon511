import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { SiteSettingsService } from './site-settings.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';

@Controller('site-settings')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class SiteSettingsController {
  constructor(private readonly service: SiteSettingsService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Patch(':key')
  update(@Param('key') key: string, @Body('value') value: unknown, @CurrentUser() user: CurrentUserPayload) {
    return this.service.update(key, value, user.userId);
  }
}
