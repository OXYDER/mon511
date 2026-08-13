import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Database } from '../../database/schema';
import { computeAuthenticitySignal } from '../reports/authenticity.util';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { ModerationDecisionDto } from './dto/moderation-decision.dto';
import { MunicipalityIntegrationsService } from '../municipality-integrations/municipality-integrations.service';
import { ReputationService } from '../reputation/reputation.service';
import { EmailService } from '../../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ModerationService {
  constructor(
    @Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>,
    private readonly municipalityIntegrations: MunicipalityIntegrationsService,
    private readonly notifications: NotificationsService,
    private readonly reputationService: ReputationService,
    private readonly email: EmailService,
  ) {}

  /** File d'attente — signalements en attente de modération, plus récents en premier. */
  async findQueue(regionId?: string) {
    let query = this.db
      .selectFrom('reports')
      .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .select([
        'reports.id', 'reports.description', 'reports.address_text',
        'reports.municipality_notified', 'reports.created_at',
        'problem_types.name_fr as problemTypeNameFr',
        'problem_types.icon as problemTypeIcon',
        sql<string | null>`(SELECT url FROM report_photos WHERE report_photos.report_id = reports.id ORDER BY uploaded_at ASC LIMIT 1)`.as('thumbnailUrl'),
      ])
      .where('reports.status', '=', 'pending_moderation')
      .orderBy('reports.created_at', 'asc');

    if (regionId) query = query.where('reports.region_id', '=', regionId);

    return query.execute();
  }

  /** Vue admin — TOUS les signalements de TOUS les usagers (pas seulement
   * ceux en attente de modération), avec recherche, filtre de statut et tri
   * par municipalité. */
  async findAllReports(params: {
    search?: string;
    status?: string;
    sortBy?: 'created_at' | 'municipality';
    sortDir?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
  }) {
    const { search, status, sortBy = 'created_at', sortDir = 'desc', limit = 30, offset = 0 } = params;

    let query = this.db
      .selectFrom('reports')
      .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .leftJoin('regions', 'regions.id', 'reports.region_id')
      .leftJoin('users', 'users.id', 'reports.user_id')
      .select([
        'reports.id', 'reports.description', 'reports.address_text as addressText',
        'reports.status', 'reports.created_at',
        'problem_types.name_fr as problemTypeNameFr', 'problem_types.name_en as problemTypeNameEn',
        'problem_types.icon as problemTypeIcon',
        'regions.name_fr as municipalityName',
        'users.email as authorEmail',
        sql<string | null>`(SELECT url FROM report_photos WHERE report_photos.report_id = reports.id ORDER BY uploaded_at ASC LIMIT 1)`.as('thumbnailUrl'),
      ]);

    let countQuery = this.db
      .selectFrom('reports')
      .leftJoin('regions', 'regions.id', 'reports.region_id')
      .leftJoin('users', 'users.id', 'reports.user_id')
      .select(({ fn }) => fn.count<number>('reports.id').as('count'));

    if (status) {
      query = query.where('reports.status', '=', status as any);
      countQuery = countQuery.where('reports.status', '=', status as any);
    }
    if (search) {
      const pattern = `%${search}%`;
      query = query.where((eb) => eb.or([
        eb('reports.description', 'ilike', pattern),
        eb('reports.address_text', 'ilike', pattern),
        eb('users.email', 'ilike', pattern),
        eb('regions.name_fr', 'ilike', pattern),
      ]));
      countQuery = countQuery.where((eb) => eb.or([
        eb('reports.description', 'ilike', pattern),
        eb('reports.address_text', 'ilike', pattern),
        eb('users.email', 'ilike', pattern),
        eb('regions.name_fr', 'ilike', pattern),
      ]));
    }

    query = sortBy === 'municipality'
      ? query.orderBy('regions.name_fr', sortDir).orderBy('reports.created_at', 'desc')
      : query.orderBy('reports.created_at', sortDir);

    const [results, total] = await Promise.all([
      query.limit(limit).offset(offset).execute(),
      countQuery.executeTakeFirst(),
    ]);

    return { results, total: total?.count ?? 0 };
  }

  async findDetail(reportId: string) {
    const report = await this.db
      .selectFrom('reports')
      .leftJoin('regions', 'regions.id', 'reports.region_id')
      .selectAll('reports')
      .select([
        'regions.name_fr as regionNameFr',
        sql<number>`ST_Y(reports.location::geometry)`.as('latitude'),
        sql<number>`ST_X(reports.location::geometry)`.as('longitude'),
      ])
      .where('reports.id', '=', reportId)
      .executeTakeFirst();
    if (!report) throw new NotFoundException('Signalement introuvable.');

    const photos = await this.db
      .selectFrom('report_photos')
      .select([
        'id', 'url', 'exif_latitude', 'exif_longitude', 'exif_captured_at',
        'exif_camera_make', 'exif_camera_model',
      ])
      .where('report_id', '=', reportId)
      .execute();

    const authenticity = computeAuthenticitySignal(photos, report.latitude, report.longitude, report.created_at as any);

    const messages = await this.db
      .selectFrom('report_messages')
      .innerJoin('users', 'users.id', 'report_messages.author_id')
      .select([
        'report_messages.id', 'report_messages.message', 'report_messages.author_role',
        'report_messages.created_at', 'users.email as authorEmail',
      ])
      .where('report_id', '=', reportId)
      .orderBy('report_messages.created_at', 'asc')
      .execute();

    const flags = await this.db
      .selectFrom('report_flags')
      .select(['reason', 'notes', 'created_at'])
      .where('report_id', '=', reportId)
      .execute();

    return { report, messages, flags, photos, authenticity };
  }

  /** Corrige la municipalité associée à un signalement avant décision — la
   * détection automatique (nom via géolocalisation) peut se tromper près
   * d'une frontière ou si aucune correspondance n'a été trouvée. */
  async setRegion(reportId: string, regionId: string | null) {
    await this.db
      .updateTable('reports')
      .set({ region_id: regionId, updated_at: new Date() as any })
      .where('id', '=', reportId)
      .execute();
    return { reportId, regionId };
  }

  /**
   * Décision de modération — approuver ou refuser. Un refus exige un motif
   * (§11 du modèle de données) : contrôlé ici ET en base via une contrainte
   * CHECK, en défense en profondeur.
   */
  async decide(reportId: string, moderatorId: string, dto: ModerationDecisionDto) {
    if (dto.decision === 'reject' && !dto.reason) {
      throw new BadRequestException('Un motif est obligatoire pour refuser un signalement.');
    }

    const newStatus = dto.decision === 'approve' ? 'published_unresolved' : 'rejected';

    return this.db.transaction().execute(async (trx) => {
      const current = await trx
        .selectFrom('reports')
        .select('status')
        .where('id', '=', reportId)
        .executeTakeFirstOrThrow();

      await trx
        .updateTable('reports')
        .set({
          status: newStatus,
          updated_at: new Date() as any,
          ...(dto.decision === 'approve' && { last_confirmed_at: new Date() as any }),
          ...(dto.decision === 'reject' && { rejected_at: new Date() as any }),
        })
        .where('id', '=', reportId)
        .execute();

      await trx
        .insertInto('report_status_history')
        .values({
          report_id: reportId,
          old_status: current.status,
          new_status: newStatus,
          changed_by: moderatorId,
          reason: dto.reason ?? null,
        })
        .execute();

      return { reportId, newStatus };
    }).then(async (result) => {
      // Effets de bord hors transaction : notification à l'auteur, et envoi
      // à la municipalité si approuvé. Simplifié en appels directs pour ce
      // premier déploiement plutôt que via une file BullMQ séparée.
      const report = await this.db
        .selectFrom('reports')
        .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
        .leftJoin('users', 'users.id', 'reports.user_id')
        .leftJoin('regions', 'regions.id', 'reports.region_id')
        .select([
          'reports.id', 'reports.user_id', 'reports.address_text', 'reports.created_at',
          'problem_types.name_fr as problemTypeNameFr',
          'users.email', 'users.first_name',
          'regions.name_fr as municipalityName',
          sql<string | null>`(SELECT url FROM report_photos WHERE report_photos.report_id = reports.id ORDER BY uploaded_at ASC LIMIT 1)`.as('photoUrl'),
        ])
        .where('reports.id', '=', reportId)
        .executeTakeFirst();

      if (report?.user_id) {
        const frontendUrl = process.env.FRONTEND_URL ?? 'https://mon511.ca';
        const reportUrl = `${frontendUrl}/?report=${reportId}`;
        const commonVars = {
          firstName: report.first_name ?? '',
          reportType: report.problemTypeNameFr,
          reportDate: new Date(report.created_at as any).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' }),
          reportAddress: report.address_text ?? 'Position GPS',
          reportMunicipality: report.municipalityName ?? '',
          reportPhotoUrl: report.photoUrl ?? '',
          reportUrl,
        };

        if (dto.decision === 'approve') {
          await this.notifications.create({
            userId: report.user_id,
            type: 'report_approved',
            reportId,
            title: 'Ton signalement a été approuvé',
            body: 'Il est maintenant visible publiquement sur la carte.',
          });
          if (report.email) {
            this.email
              .sendTemplated('report_approved', report.email, commonVars, { ctaLabel: 'Voir mon signalement', ctaUrl: reportUrl })
              .catch(() => {});
          }
          await this.municipalityIntegrations.notifyMunicipality(reportId);
        } else {
          const lifecycle = await this.db
            .selectFrom('site_settings')
            .select('value')
            .where('key', '=', 'lifecycle_days')
            .executeTakeFirst();
          const correctionDays = (lifecycle?.value as any)?.rejectionCorrectionDays ?? 7;

          await this.notifications.create({
            userId: report.user_id,
            type: 'report_rejected',
            reportId,
            title: 'Ton signalement a été refusé',
            body: dto.reason,
          });
          if (report.email) {
            this.email
              .sendTemplated(
                'report_rejected',
                report.email,
                { ...commonVars, rejectReason: dto.reason ?? '', correctionDays: String(correctionDays) },
                { ctaLabel: 'Corriger mon signalement', ctaUrl: `${frontendUrl}/?editReport=${reportId}` },
              )
              .catch(() => {});
          }
          await this.reputationService.award(report.user_id, 'report_rejected', reportId);
        }
      }

      return result;
    });
  }

  /** Fil de discussion avec l'usager — voir écran de modération dans l'admin. */
  async reply(reportId: string, authorId: string, authorRole: 'user' | 'moderator', message: string) {
    return this.db
      .insertInto('report_messages')
      .values({ report_id: reportId, author_id: authorId, author_role: authorRole, message })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Signalements d'abus non encore traités — regroupés par signalement,
   * avec le nombre de signalements d'abus et le motif le plus récent. */
  async findFlaggedReports() {
    const rows = await this.db
      .selectFrom('report_flags')
      .innerJoin('reports', 'reports.id', 'report_flags.report_id')
      .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .select([
        'reports.id', 'reports.description', 'reports.address_text', 'reports.status',
        'problem_types.name_fr as problemTypeNameFr', 'problem_types.icon as problemTypeIcon',
        'report_flags.reason', 'report_flags.notes', 'report_flags.created_at as flaggedAt',
      ])
      .where('report_flags.handled_at', 'is', null)
      .orderBy('report_flags.created_at', 'desc')
      .execute();

    // Regroupe par signalement — plusieurs flags peuvent viser le même signalement.
    const byReport = new Map<string, any>();
    for (const row of rows) {
      if (!byReport.has(row.id)) {
        byReport.set(row.id, { ...row, flagCount: 0, reasons: [] as string[] });
      }
      const entry = byReport.get(row.id);
      entry.flagCount += 1;
      entry.reasons.push(row.reason);
    }
    return Array.from(byReport.values());
  }

  private async markFlagsHandled(reportId: string, moderatorId: string) {
    await this.db
      .updateTable('report_flags')
      .set({ handled_at: new Date() as any, handled_by: moderatorId })
      .where('report_id', '=', reportId)
      .where('handled_at', 'is', null)
      .execute();
  }

  async dismissFlags(reportId: string, moderatorId: string) {
    // Les usagers qui ont signalé à tort — pas de pénalité par défaut
    // (flag_rejected = 0 au barème), mais l'événement reste journalisé.
    const flaggers = await this.db
      .selectFrom('report_flags')
      .select('user_id')
      .where('report_id', '=', reportId)
      .where('handled_at', 'is', null)
      .execute();
    for (const f of flaggers) await this.reputationService.award(f.user_id, 'flag_rejected', reportId);

    await this.markFlagsHandled(reportId, moderatorId);
    return { reportId, dismissed: true };
  }

  async removeReportForAbuse(reportId: string, moderatorId: string, reason: string) {
    // Les usagers qui ont signalé à raison — points pour eux, pénalité pour l'auteur du contenu retiré.
    const [flaggers, report] = await Promise.all([
      this.db.selectFrom('report_flags').select('user_id').where('report_id', '=', reportId).where('handled_at', 'is', null).execute(),
      this.db.selectFrom('reports').select('user_id').where('id', '=', reportId).executeTakeFirst(),
    ]);
    for (const f of flaggers) await this.reputationService.award(f.user_id, 'flag_upheld', reportId);
    if (report?.user_id) await this.reputationService.award(report.user_id, 'report_flagged_valid', reportId);

    await this.markFlagsHandled(reportId, moderatorId);
    await this.db
      .updateTable('reports')
      .set({ status: 'rejected', updated_at: new Date() as any })
      .where('id', '=', reportId)
      .execute();
    await this.db
      .insertInto('report_status_history')
      .values({ report_id: reportId, old_status: 'published_unresolved', new_status: 'rejected', changed_by: moderatorId, reason })
      .execute();
    return { reportId, removed: true };
  }

  /** Suggestions de résolution en attente — signalements où quelqu'un a
   * proposé "résolu" mais qui n'ont pas encore atteint le seuil de poids
   * pour se résoudre automatiquement. */
  async findPendingResolutionSuggestions() {
    const rows = await this.db
      .selectFrom('report_resolution_suggestions')
      .innerJoin('reports', 'reports.id', 'report_resolution_suggestions.report_id')
      .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .select([
        'reports.id', 'reports.description', 'reports.address_text', 'reports.status',
        'problem_types.name_fr as problemTypeNameFr', 'problem_types.icon as problemTypeIcon',
        'report_resolution_suggestions.comment', 'report_resolution_suggestions.weight',
        'report_resolution_suggestions.created_at as suggestedAt',
      ])
      .where('report_resolution_suggestions.status', '=', 'pending')
      .where('reports.status', '=', 'published_unresolved')
      .orderBy('report_resolution_suggestions.created_at', 'desc')
      .execute();

    const byReport = new Map<string, any>();
    for (const row of rows) {
      if (!byReport.has(row.id)) {
        byReport.set(row.id, { ...row, suggestionCount: 0, totalWeight: 0 });
      }
      const entry = byReport.get(row.id);
      entry.suggestionCount += 1;
      entry.totalWeight += row.weight;
    }
    return Array.from(byReport.values());
  }

  async acceptResolution(reportId: string, moderatorId: string) {
    const suggesters = await this.db
      .selectFrom('report_resolution_suggestions')
      .select('suggested_by')
      .where('report_id', '=', reportId)
      .where('status', '=', 'pending')
      .execute();

    await this.db
      .updateTable('report_resolution_suggestions')
      .set({ status: 'accepted' })
      .where('report_id', '=', reportId)
      .where('status', '=', 'pending')
      .execute();
    await this.db
      .updateTable('reports')
      .set({ status: 'published_resolved', resolved_at: new Date() as any, updated_at: new Date() as any })
      .where('id', '=', reportId)
      .execute();
    await this.db
      .insertInto('report_status_history')
      .values({ report_id: reportId, old_status: 'published_unresolved', new_status: 'published_resolved', changed_by: moderatorId, reason: 'Confirmé par la modération' })
      .execute();

    for (const s of suggesters) await this.reputationService.award(s.suggested_by, 'resolution_suggestion_correct', reportId);
    const report = await this.db.selectFrom('reports').select('user_id').where('id', '=', reportId).executeTakeFirst();
    if (report?.user_id) await this.reputationService.award(report.user_id, 'report_resolved', reportId);
    return { reportId, accepted: true };
  }

  async dismissResolution(reportId: string) {
    await this.db
      .updateTable('report_resolution_suggestions')
      .set({ status: 'dismissed' })
      .where('report_id', '=', reportId)
      .where('status', '=', 'pending')
      .execute();
    return { reportId, dismissed: true };
  }
}
