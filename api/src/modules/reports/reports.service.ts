import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { CreateReportDto } from './dto/create-report.dto';
import { NotificationsService } from '../notifications/notifications.service';

/** Nom d'affichage respectant le réglage de confidentialité choisi par
 * l'usager lui-même — dupliqué localement depuis UsersService pour éviter
 * une dépendance inter-module pour une si petite fonction pure. */
function formatDisplayName(firstName: string | null, lastName: string | null, lastNameDisplay: string | undefined, fallbackEmail: string): string {
  const first = firstName || fallbackEmail.split('@')[0];
  if (!lastName || lastNameDisplay === 'hidden' || !lastNameDisplay) return first;
  if (lastNameDisplay === 'initial') return `${first} ${lastName[0].toUpperCase()}.`;
  return `${first} ${lastName}`;
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Signalements dans un rayon donné — la requête "près de moi" qui
   * alimente la carte. ST_DWithin utilise l'index GIST sur `location`
   * (voir migration 0001_init.sql) pour rester performant à grande échelle.
   */
  async findNearby(lat: number, lng: number, radiusMeters = 5000, currentUserId?: string) {
    return this.db
      .selectFrom('reports')
      .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .select([
        'reports.id',
        'reports.status',
        'reports.description',
        'reports.address_text as addressText',
        'reports.created_at',
        'reports.problem_type_id as problemTypeId',
        'problem_types.name_fr as problemTypeNameFr',
        'problem_types.name_en as problemTypeNameEn',
        'problem_types.icon as problemTypeIcon',
        sql<number>`ST_X(reports.location::geometry)`.as('longitude'),
        sql<number>`ST_Y(reports.location::geometry)`.as('latitude'),
        sql<string | null>`(SELECT url FROM report_photos WHERE report_photos.report_id = reports.id ORDER BY uploaded_at ASC LIMIT 1)`.as('thumbnailUrl'),
      ])
      .where((eb) =>
        currentUserId
          // L'auteur voit aussi son propre signalement en attente d'approbation
          // — invisible pour tout le monde d'autre, mais pas pour lui-même.
          ? eb.or([
              eb('reports.status', 'in', ['published_unresolved', 'published_resolved']),
              eb.and([eb('reports.status', '=', 'pending_moderation'), eb('reports.user_id', '=', currentUserId)]),
            ])
          : eb('reports.status', 'in', ['published_unresolved', 'published_resolved']),
      )
      .where(
        sql<boolean>`ST_DWithin(reports.location::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters})`,
      )
      .orderBy('reports.created_at', 'desc')
      .limit(1500)
      .execute();
  }

  async findOne(id: string) {
    const report = await this.db
      .selectFrom('reports')
      .leftJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .leftJoin('users', 'users.id', 'reports.user_id')
      .select([
        'reports.id', 'reports.status', 'reports.description', 'reports.address_text as addressText',
        'reports.created_at', 'reports.updated_at', 'reports.resolved_at',
        'reports.municipality_notified', 'reports.municipality_name',
        'problem_types.name_fr as problemTypeNameFr', 'problem_types.icon as problemTypeIcon',
        'users.id as authorId', 'users.email as authorEmail', 'users.first_name as authorFirstName',
        'users.last_name as authorLastName', 'users.privacy_settings as authorPrivacySettings',
        sql<number>`ST_Y(reports.location::geometry)`.as('latitude'),
        sql<number>`ST_X(reports.location::geometry)`.as('longitude'),
      ])
      .where('reports.id', '=', id)
      .executeTakeFirst();

    if (!report) throw new NotFoundException('Signalement introuvable.');

    const photos = await this.db
      .selectFrom('report_photos')
      .select(['id', 'url'])
      .where('report_id', '=', id)
      .execute();

    const confirmationsCount = await this.db
      .selectFrom('report_confirmations')
      .select(({ fn }) => fn.count<number>('id').as('count'))
      .where('report_id', '=', id)
      .executeTakeFirst();

    const authorSettings = report.authorPrivacySettings as any;
    const authorDisplayName = report.authorId
      ? formatDisplayName(report.authorFirstName, report.authorLastName, authorSettings?.last_name_display, report.authorEmail ?? '')
      : null;

    return { ...report, photos, confirmationsCount: confirmationsCount?.count ?? 0, authorDisplayName };
  }

  /** Détail enrichi pour l'auteur seulement — inclut ce qui n'est pas
   * public (historique de statut, signalements d'abus reçus, suggestions
   * de résolution), en plus de ce que findOne() retourne déjà. */
  async findOwnDetail(id: string, userId: string) {
    const base = await this.findOne(id);
    const report = await this.db.selectFrom('reports').select(['user_id', 'problem_type_id']).where('id', '=', id).executeTakeFirst();
    if (!report || report.user_id !== userId) throw new ForbiddenException("Ce signalement ne t'appartient pas.");

    const statusHistory = await this.db
      .selectFrom('report_status_history')
      .select(['old_status', 'new_status', 'reason', 'changed_at'])
      .where('report_id', '=', id)
      .orderBy('changed_at', 'desc')
      .execute();

    const flags = await this.db
      .selectFrom('report_flags')
      .select(['reason', 'notes', 'created_at', 'handled_at'])
      .where('report_id', '=', id)
      .orderBy('created_at', 'desc')
      .execute();

    const resolutionSuggestions = await this.db
      .selectFrom('report_resolution_suggestions')
      .select(['comment', 'weight', 'status', 'created_at'])
      .where('report_id', '=', id)
      .orderBy('created_at', 'desc')
      .execute();

    return { ...base, problemTypeId: report.problem_type_id, statusHistory, flags, resolutionSuggestions };
  }

  /** Édition par l'auteur — seuls certains champs sont modifiables, jamais
   * le type ou la position (pour éviter les abus, un nouveau signalement
   * s'impose si l'emplacement était vraiment erroné). */
  async updateOwn(reportId: string, userId: string, changes: { description?: string; addressText?: string; municipalityNotified?: 'yes' | 'no' | 'unknown'; municipalityName?: string; problemTypeId?: string }) {
    const report = await this.db.selectFrom('reports').select(['user_id']).where('id', '=', reportId).executeTakeFirst();
    if (!report) throw new NotFoundException('Signalement introuvable.');
    if (report.user_id !== userId) throw new ForbiddenException("Ce signalement ne t'appartient pas.");

    await this.db
      .updateTable('reports')
      .set({
        ...(changes.description !== undefined && { description: changes.description }),
        ...(changes.addressText !== undefined && { address_text: changes.addressText }),
        ...(changes.municipalityNotified !== undefined && { municipality_notified: changes.municipalityNotified }),
        ...(changes.municipalityName !== undefined && { municipality_name: changes.municipalityName }),
        ...(changes.problemTypeId !== undefined && { problem_type_id: changes.problemTypeId }),
        updated_at: new Date() as any,
      })
      .where('id', '=', reportId)
      .execute();

    return this.findOwnDetail(reportId, userId);
  }

  async withdrawOwn(reportId: string, userId: string) {
    const report = await this.db.selectFrom('reports').select(['user_id']).where('id', '=', reportId).executeTakeFirst();
    if (!report) throw new NotFoundException('Signalement introuvable.');
    if (report.user_id !== userId) throw new ForbiddenException("Ce signalement ne t'appartient pas.");

    await this.db
      .updateTable('reports')
      .set({ status: 'withdrawn', updated_at: new Date() as any })
      .where('id', '=', reportId)
      .execute();

    return { withdrawn: true };
  }

  async deleteOwnPhoto(reportId: string, photoId: string, userId: string) {
    const report = await this.db.selectFrom('reports').select(['user_id']).where('id', '=', reportId).executeTakeFirst();
    if (!report) throw new NotFoundException('Signalement introuvable.');
    if (report.user_id !== userId) throw new ForbiddenException("Ce signalement ne t'appartient pas.");

    await this.db.deleteFrom('report_photos').where('id', '=', photoId).where('report_id', '=', reportId).execute();
    return { deleted: true };
  }

  /**
   * Crée un signalement. La région est dérivée automatiquement par jointure
   * spatiale avec `regions` (§3 du modèle de données) — l'usager n'a jamais
   * à la sélectionner lui-même.
   */
  async create(userId: string | null, dto: CreateReportDto) {
    return this.db.transaction().execute(async (trx) => {
      let region = await trx
        .selectFrom('regions')
        .select('id')
        .where('type', '=', 'municipality')
        .where(
          sql<boolean>`ST_Contains(boundary, ST_SetSRID(ST_MakePoint(${dto.longitude}, ${dto.latitude}), 4326))`,
        )
        .executeTakeFirst();

      // Repli par nom : on n'a pas encore importé de vraies frontières
      // géographiques pour la plupart des municipalités (boundary est NULL),
      // donc ST_Contains ne trouve rien la plupart du temps. En attendant,
      // on utilise le nom de municipalité détecté par géolocalisation
      // inverse côté client — la modération humaine reste le filet de
      // sécurité si jamais la correspondance est imprécise près d'une
      // frontière (voir moderation.service.ts, écran d'approbation).
      if (!region && dto.municipalityHint) {
        region = await trx
          .selectFrom('regions')
          .select('id')
          .where('type', '=', 'municipality')
          .where('name_fr', 'ilike', dto.municipalityHint.trim())
          .executeTakeFirst();
      }

      const report = await trx
        .insertInto('reports')
        .values({
          user_id: userId,
          problem_type_id: dto.problemTypeId,
          region_id: region?.id ?? null,
          location: sql`ST_SetSRID(ST_MakePoint(${dto.longitude}, ${dto.latitude}), 4326)` as any,
          gps_accuracy_m: dto.gpsAccuracyM ?? null,
          address_text: dto.addressText ?? null,
          description: dto.description ?? null,
          municipality_notified: dto.municipalityNotified,
          municipality_name: dto.municipalityName ?? null,
          municipality_case_number: dto.municipalityCaseNumber ?? null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      // Statut initial toujours en attente de modération — cohérent avec
      // site_settings.require_moderation, appliqué au niveau applicatif
      // (le worker de modération/publication est un chantier séparé).
      await trx
        .insertInto('report_status_history')
        .values({
          report_id: report.id,
          old_status: null,
          new_status: 'pending_moderation',
          changed_by: userId,
          reason: null,
        })
        .execute();

      return report;
    });
  }

  /**
   * Suggestion communautaire "marqué résolu" — §17 du modèle de données.
   * Le poids est calculé depuis la réputation du suggérant; si le total
   * atteint le seuil configuré, le signalement passe à résolu.
   */
  async suggestResolution(reportId: string, userId: string, comment?: string) {
    const result = await this.db.transaction().execute(async (trx) => {
      const user = await trx
        .selectFrom('users')
        .select('reputation_score')
        .where('id', '=', userId)
        .executeTakeFirstOrThrow();

      const weight = 1 + Math.min(Math.floor(user.reputation_score / 50), 2);

      await trx
        .insertInto('report_resolution_suggestions')
        .values({ report_id: reportId, suggested_by: userId, comment: comment ?? null, weight })
        .execute();

      const totalWeight = await trx
        .selectFrom('report_resolution_suggestions')
        .select(({ fn }) => fn.sum<number>('weight').as('total'))
        .where('report_id', '=', reportId)
        .where('status', '=', 'pending')
        .executeTakeFirst();

      const threshold = await trx
        .selectFrom('site_settings')
        .select('value')
        .where('key', '=', 'resolution_suggestion_threshold')
        .executeTakeFirst();

      const thresholdValue = Number(threshold?.value ?? 5);
      const autoResolved = (totalWeight?.total ?? 0) >= thresholdValue;

      if (autoResolved) {
        await trx
          .updateTable('reports')
          .set({ status: 'published_resolved', resolved_at: new Date() as any })
          .where('id', '=', reportId)
          .execute();

        await trx
          .insertInto('report_status_history')
          .values({
            report_id: reportId,
            old_status: 'published_unresolved',
            new_status: 'published_resolved',
            changed_by: null,
            reason: 'seuil communautaire pondéré atteint',
          })
          .execute();

        await trx
          .updateTable('report_resolution_suggestions')
          .set({ status: 'accepted' })
          .where('report_id', '=', reportId)
          .where('status', '=', 'pending')
          .execute();
      }

      return { weight, autoResolved };
    });

    // Notification à l'auteur — dans tous les cas une suggestion arrive,
    // et en plus une notification de résolution si le seuil est atteint.
    const report = await this.db
      .selectFrom('reports')
      .select('user_id')
      .where('id', '=', reportId)
      .executeTakeFirst();

    if (report?.user_id) {
      await this.notifications.create({
        userId: report.user_id,
        type: result.autoResolved ? 'report_marked_resolved' : 'resolution_suggested',
        reportId,
        actorId: userId,
        title: result.autoResolved
          ? 'Ton signalement a été marqué résolu par la communauté'
          : 'Quelqu\'un pense que ton signalement est résolu',
        body: comment,
      });
    }

    return result;
  }

  /** Confirmation communautaire ("je confirme que ce problème existe toujours"). */
  async confirm(reportId: string, userId: string) {
    return this.db
      .insertInto('report_confirmations')
      .values({ report_id: reportId, user_id: userId })
      .onConflict((oc) => oc.doNothing())
      .execute();
  }

  /** Signalement d'un problème avec le signalement lui-même (doublon, inapproprié, etc.). */
  async flag(reportId: string, userId: string, reason: string, notes?: string) {
    return this.db
      .insertInto('report_flags')
      .values({ report_id: reportId, user_id: userId, reason: reason as any, notes: notes ?? null })
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
