import { Module } from '@nestjs/common';
import { UploadsController, PostMediaUploadController } from './uploads.controller';
import { UploadsService } from './uploads.service';

@Module({
  controllers: [UploadsController, PostMediaUploadController],
  providers: [UploadsService],
  exports: [UploadsService],
})
export class UploadsModule {}
