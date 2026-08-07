import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { MunicipalityIntegrationsService } from './municipality-integrations.service';
import { UpsertMunicipalityIntegrationDto } from './dto/upsert-municipality-integration.dto';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';
import { CurrentUser, CurrentUserPayload } from '../../auth/decorators/current-user.decorator';

@Controller('municipality-integrations')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'super_admin')
export class MunicipalityIntegrationsController {
  constructor(private readonly service: MunicipalityIntegrationsService) {}

  @Get()
  findAll(
    @Query('search') search?: string,
    @Query('limit') limit = '50',
    @Query('offset') offset = '0',
  ) {
    return this.service.findAll(search, Number(limit), Number(offset));
  }

  @Post()
  upsert(@Body() dto: UpsertMunicipalityIntegrationDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.upsert(dto, user.userId);
  }

  @Patch(':id/auto-send')
  toggleAutoSend(@Param('id') id: string, @Body('enabled') enabled: boolean, @CurrentUser() user: CurrentUserPayload) {
    return this.service.toggleAutoSend(id, enabled, user.userId);
  }
}
