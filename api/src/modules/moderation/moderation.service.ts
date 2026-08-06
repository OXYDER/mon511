import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { ModerationDecisionDto } from './dto/moderation-decision.dto';
import { MunicipalityIntegrationsService } from '../municipality-integrations/municipality-integrations.service';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class ModerationService {
  constructor(
    @Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>,
    private readonly municipalityIntegrations: MunicipalityIntegrationsService,
    private readonly notifications: NotificationsService,
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
      ])
      .where('reports.status', '=', 'pending_moderation')
      .orderBy('reports.created_at', 'asc');

    if (regionId) query = query.where('reports.region_id', '=', regionId);

    return query.execute();
  }

  async findDetail(reportId: string) {
    const report = await this.db
      .selectFrom('reports')
      .selectAll()
      .where('id', '=', reportId)
      .executeTakeFirst();
    if (!report) throw new NotFoundException('Signalement introuvable.');

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

    return { report, messages, flags };
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
        .set({ status: newStatus, updated_at: new Date() as any })
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
        .select('user_id')
        .where('id', '=', reportId)
        .executeTakeFirst();

      if (report?.user_id) {
        if (dto.decision === 'approve') {
          await this.notifications.create({
            userId: report.user_id,
            type: 'report_approved',
            reportId,
            title: 'Ton signalement a été approuvé',
            body: 'Il est maintenant visible publiquement sur la carte.',
          });
          await this.municipalityIntegrations.notifyMunicipality(reportId);
        } else {
          await this.notifications.create({
            userId: report.user_id,
            type: 'report_rejected',
            reportId,
            title: 'Ton signalement a été refusé',
            body: dto.reason,
          });
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

  async dismissFlags(reportId: string, moderatorId: string) {
    await this.db
      .updateTable('report_flags')
      .set({ handled_at: new Date() as any, handled_by: moderatorId })
      .where('report_id', '=', reportId)
      .where('handled_at', 'is', null)
      .execute();
    return { reportId, dismissed: true };
  }

  async removeReportForAbuse(reportId: string, moderatorId: string, reason: string) {
    await this.dismissFlags(reportId, moderatorId);
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
