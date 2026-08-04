import { Module } from '@nestjs/common';
import { ExternalDataController } from './external-data.controller';
import { ExternalDataService } from './external-data.service';

@Module({
  controllers: [ExternalDataController],
  providers: [ExternalDataService],
  exports: [ExternalDataService],
})
export class ExternalDataModule {}
