import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
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
  findAll() {
    return this.service.findAll();
  }

  @Post()
  upsert(@Body() dto: UpsertMunicipalityIntegrationDto, @CurrentUser() user: CurrentUserPayload) {
    return this.service.upsert(dto, user.userId);
  }
}
