import { Controller, Get, Post, Query, Param, UseGuards } from '@nestjs/common';
import { ExternalDataService } from './external-data.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@Controller('external-data')
export class ExternalDataController {
  constructor(private readonly service: ExternalDataService) {}

  @Get('incidents/nearby')
  findNearby(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius = '15000',
  ) {
    return this.service.findNearby(Number(lat), Number(lng), Number(radius));
  }

  @Get('sources')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  listSources() {
    return this.service.listSources();
  }

  // Déclenchement manuel — à remplacer par un vrai cron une fois stabilisé (voir README).
  @Post('sources/:feedKey/sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  sync(@Param('feedKey') feedKey: string) {
    return this.service.syncSource(feedKey);
  }
}
