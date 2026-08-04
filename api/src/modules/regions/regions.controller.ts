import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { RegionsService } from './regions.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { Roles } from '../../auth/decorators/roles.decorator';

@Controller('regions')
export class RegionsController {
  constructor(private readonly service: RegionsService) {}

  @Get()
  findActive() {
    return this.service.findActive();
  }

  @Get('admin')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  findAllForAdmin() {
    return this.service.findAllForAdmin();
  }

  @Patch(':id/deployment-status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'super_admin')
  updateDeploymentStatus(
    @Param('id') id: string,
    @Body('status') status: 'active' | 'partial' | 'inactive',
  ) {
    return this.service.updateDeploymentStatus(id, status);
  }
}
