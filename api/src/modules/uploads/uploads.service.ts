import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { Kysely } from 'kysely';
import { randomUUID } from 'crypto';
import * as exifr from 'exifr';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';

@Injectable()
export class UploadsService {
  private readonly s3: S3Client;
  private readonly bucket = 'mon511-reports';
  private readonly logger = new Logger(UploadsService.name);

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

    // Extraction EXIF directement du fichier reçu sur le serveur — pas de
    // valeurs envoyées par le navigateur, donc pas falsifiable par un
    // client malveillant qui voudrait maquiller la provenance d'une photo.
    let exif: { latitude?: number; longitude?: number; capturedAt?: Date; make?: string; model?: string; raw?: any } = {};
    try {
      const [gps, meta] = await Promise.all([
        exifr.gps(file.buffer).catch(() => null),
        exifr.parse(file.buffer, { pick: ['DateTimeOriginal', 'CreateDate', 'Make', 'Model'] }).catch(() => null),
      ]);
      exif = {
        latitude: gps?.latitude,
        longitude: gps?.longitude,
        capturedAt: meta?.DateTimeOriginal ?? meta?.CreateDate ?? undefined,
        make: meta?.Make,
        model: meta?.Model,
        raw: meta ?? undefined,
      };
    } catch (error) {
      // Pas d'EXIF lisible (photo sans métadonnées, format non supporté,
      // etc.) — pas une erreur bloquante, juste une photo non vérifiable.
      this.logger.debug(`Pas d'EXIF exploitable pour ${key}`);
    }

    return this.db
      .insertInto('report_photos')
      .values({
        report_id: reportId,
        url: publicUrl,
        storage_driver: 'minio',
        storage_key: key,
        exif_latitude: exif.latitude ?? null,
        exif_longitude: exif.longitude ?? null,
        exif_captured_at: (exif.capturedAt as any) ?? null,
        exif_camera_make: exif.make ?? null,
        exif_camera_model: exif.model ?? null,
        exif_raw: exif.raw ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Téléversement pour une publication du fil communautaire — photo ou
   * vidéo. La vidéo respecte la bascule admin feed_video_enabled
   * (site_settings), vérifiée ici plutôt que seulement côté frontend,
   * pour empêcher un contournement direct de l'API. */
  async uploadFeedMedia(file: Express.Multer.File, mediaType: 'photo' | 'video') {
    if (mediaType === 'video') {
      const setting = await this.db.selectFrom('site_settings').select('value').where('key', '=', 'feed_video_enabled').executeTakeFirst();
      if (setting?.value === false) {
        throw new BadRequestException('La vidéo est désactivée pour le fil communautaire en ce moment.');
      }
    }

    const key = `posts/${mediaType}/${randomUUID()}-${file.originalname}`;
    await this.s3.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: file.buffer, ContentType: file.mimetype }));
    const publicUrl = `${this.config.get('STORAGE_PUBLIC_URL') ?? `http://${this.config.get('STORAGE_ENDPOINT')}:${this.config.get('STORAGE_PORT')}`}/${this.bucket}/${key}`;
    return { url: publicUrl };
  }

  /** Téléversement générique, sans extraction EXIF ni lien avec un
   * signalement précis — utilisé pour les pièces jointes des billets de
   * support (peuvent être n'importe quel type de fichier raisonnable, pas
   * seulement des photos). */
  async uploadGenericFile(folder: string, file: Express.Multer.File): Promise<{ url: string; filename: string }> {
    const key = `${folder}/${randomUUID()}-${file.originalname}`;

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      }),
    );

    const publicUrl = `${this.config.get('STORAGE_PUBLIC_URL') ?? `http://${this.config.get('STORAGE_ENDPOINT')}:${this.config.get('STORAGE_PORT')}`}/${this.bucket}/${key}`;
    return { url: publicUrl, filename: file.originalname };
  }

  /** Supprime réellement les fichiers du stockage (pas seulement la ligne
   * en base) — utilisé notamment par LifecycleService lors de la
   * suppression définitive d'un signalement archivé expiré. */
  async deleteObjects(keys: string[]) {
    if (keys.length === 0) return;
    try {
      await this.s3.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: keys.map((Key) => ({ Key })) },
        }),
      );
    } catch (err) {
      this.logger.error('Échec de suppression de fichiers dans le stockage', err as Error);
    }
  }
}
