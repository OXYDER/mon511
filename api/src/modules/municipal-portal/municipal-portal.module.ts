import { Module } from '@nestjs/common';
import { MunicipalPortalController } from './municipal-portal.controller';
import { MunicipalPortalService } from './municipal-portal.service';
import { UploadsModule } from '../uploads/uploads.module';

@Module({
  imports: [UploadsModule],
  controllers: [MunicipalPortalController],
  providers: [MunicipalPortalService],
})
export class MunicipalPortalModule {}
