import { Module } from '@nestjs/common';
import { MunicipalPortalController } from './municipal-portal.controller';
import { MunicipalPortalService } from './municipal-portal.service';

@Module({
  controllers: [MunicipalPortalController],
  providers: [MunicipalPortalService],
})
export class MunicipalPortalModule {}
