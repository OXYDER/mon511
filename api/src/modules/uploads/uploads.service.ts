import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { Kysely } from 'kysely';
import { randomUUID } from 'crypto';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';

@Injectable()
export class UploadsService {
  private readonly s3: S3Client;
  private readonly bucket = 'mon511-reports';

  constructor(
    @Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>,
    private readonly config: ConfigService,
  ) {
    // MinIO est compatible S3 — même SDK, seul l'endpoint change. C'est ce
    // qui permet de basculer vers S3/R2 plus tard sans réécrire ce service
    // (voir modèle de données, section stockage évolutif).
    this.s3 = new S3Client({
      endpoint: `http://${this.config.get('STORAGE_ENDPOINT')}:${this.config.get('STORAGE_PORT')}`,
      region: 'us-east-1',
      credentials: {
        accessKeyId: this.config.get('STORAGE_ACCESS_KEY') ?? '',
        secretAccessKey: this.config.get('STORAGE_SECRET_KEY') ?? '',
      },
      forcePathStyle: true, // requis pour MinIO
    });
  }

  async uploadReportPhoto(reportId: string, file: Express.Multer.File) {
    const key = `reports/${reportId}/${randomUUID()}-${file.originalname}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const publicUrl = `${this.config.get('STORAGE_PUBLIC_URL') ?? `http://${this.config.get('STORAGE_ENDPOINT')}:${this.config.get('STORAGE_PORT')}`}/${this.bucket}/${key}`;

    return this.db
      .insertInto('report_photos')
      .values({
        report_id: reportId,
        url: publicUrl,
        storage_driver: 'minio',
        storage_key: key,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
