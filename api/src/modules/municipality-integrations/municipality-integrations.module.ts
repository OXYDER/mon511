import { Module } from '@nestjs/common';
import { MunicipalityIntegrationsController } from './municipality-integrations.controller';
import { MunicipalityIntegrationsService } from './municipality-integrations.service';

@Module({
  controllers: [MunicipalityIntegrationsController],
  providers: [MunicipalityIntegrationsService],
  exports: [MunicipalityIntegrationsService],
})
export class MunicipalityIntegrationsModule {}
