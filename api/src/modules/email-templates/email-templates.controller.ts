import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { EmailTemplatesService } from './email-templates.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';

@Controller('email-templates')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class EmailTemplatesController {
  constructor(private readonly service: EmailTemplatesService) {}

  @Get()
  findAll() {
    return this.service.findAll();
  }

  @Get(':key')
  findOne(@Param('key') key: string) {
    return this.service.findOne(key);
  }

  @Get(':key/preview')
  preview(@Param('key') key: string) {
    return this.service.preview(key);
  }

  @Patch(':key')
  update(
    @Param('key') key: string,
    @Body() changes: { subject?: string; bodyHtml?: string },
    @CurrentUser() user: CurrentUserPayload,
  ) {
    return this.service.update(key, changes, user.userId);
  }
}
