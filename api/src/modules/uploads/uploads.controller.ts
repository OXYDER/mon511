import {
  Controller, Post, Param, UseGuards, UseInterceptors,
  UploadedFile, ParseFilePipe, MaxFileSizeValidator, FileTypeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { UploadsService } from './uploads.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

const MAX_PHOTO_SIZE_BYTES = 8 * 1024 * 1024; // 8 Mo
const MAX_VIDEO_SIZE_BYTES = 70 * 1024 * 1024; // 70 Mo — sans encodage serveur, fichier tel quel

@Controller('reports/:reportId/photos')
@UseGuards(JwtAuthGuard)
export class UploadsController {
  constructor(private readonly service: UploadsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @Param('reportId') reportId: string,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_PHOTO_SIZE_BYTES }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.service.uploadReportPhoto(reportId, file);
  }
}

@Controller('posts/media')
@UseGuards(JwtAuthGuard)
export class PostMediaUploadController {
  constructor(private readonly service: UploadsService) {}

  @Post('photo')
  @UseInterceptors(FileInterceptor('file'))
  uploadPhoto(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_PHOTO_SIZE_BYTES }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|webp)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.service.uploadFeedMedia(file, 'photo');
  }

  @Post('video')
  @UseInterceptors(FileInterceptor('file'))
  uploadVideo(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: MAX_VIDEO_SIZE_BYTES }),
          new FileTypeValidator({ fileType: /(mp4|mov|webm|quicktime)$/ }),
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.service.uploadFeedMedia(file, 'video');
  }
}
