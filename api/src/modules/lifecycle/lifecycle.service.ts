import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Kysely, sql } from 'kysely';
import { randomBytes } from 'crypto';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { EmailService } from '../../email/email.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UploadsService } from '../uploads/uploads.service';

interface LifecycleDays {
  rejectionCorrectionDays: number;
  stalenessWarningDays: number;
  stalenessDeadlineDays: number;
  archiveRetentionYears: number;
  duplicateDetectionRadiusMeters: number;
}

const DEFAULTS: LifecycleDays = {
  rejectionCorrectionDays: 7,
  stalenessWarningDays: 30,
  stalenessDeadlineDays: 15,
  archiveRetentionYears: 2,
  duplicateDetectionRadiusMeters: 15,
};

/**
 * Gère l'ensemble du cycle de vie d'un signalement après sa modération :
 * suppression des refus non corrigés, rappels de validité, archivage, et
 * suppression définitive des archives expirées. Tourne une fois par jour —
 * largement suffisant vu qu'on raisonne en jours, pas en heures, et évite
 * de multiplier les envois de courriels pour rien.
 */
@Injectable()
export class LifecycleService {
  private readonly logger = new Logger(LifecycleService.name);

  constructor(
    @Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>,
    private readonly email: EmailService,
    private readonly notifications: NotificationsService,
    private readonly uploads: UploadsService,
  ) {}

  private async getLifecycleDays(): Promise<LifecycleDays> {
    const setting = await this.db
      .selectFrom('site_settings')
      .select('value')
      .where('key', '=', 'lifecycle_days')
      .executeTakeFirst();
    return { ...DEFAULTS, ...(setting?.value as Partial<LifecycleDays> | undefined) };
  }

  private frontendUrl() {
    return process.env.FRONTEND_URL ?? 'https://mon511.ca';
  }

  /** Point d'entrée unique, appelé une fois par jour — les 4 étapes sont
   * volontairement séquentielles et indépendantes (une erreur dans l'une
   * ne bloque pas les autres). */
  @Cron(CronExpression.EVERY_DAY_AT_4AM)
  async runDaily() {
    this.logger.log('Cycle de vie des signalements — exécution quotidienne démarrée.');
    const days = await this.getLifecycleDays();
    await this.deleteUncorrectedRejections(days).catch((err) => this.logger.error('Étape suppression refus échouée', err));
    await this.sendStalenessReminders(days).catch((err) => this.logger.error('Étape rappels de validité échouée', err));
    await this.archiveStaleReports(days).catch((err) => this.logger.error('Étape archivage échouée', err));
    await this.deleteExpiredArchives(days).catch((err) => this.logger.error('Étape purge des archives échouée', err));
    this.logger.log('Cycle de vie des signalements — exécution quotidienne terminée.');
  }

  /** Étape 1 — signalements refusés jamais corrigés dans le délai imparti :
   * supprimés complètement (jamais eu de valeur historique, contrairement
   * aux signalements déjà approuvés). */
  private async deleteUncorrectedRejections(days: LifecycleDays) {
    const cutoff = new Date(Date.now() - days.rejectionCorrectionDays * 86400000);
    const expired = await this.db
      .selectFrom('reports')
      .select('id')
      .where('status', '=', 'rejected')
      .where('rejected_at', 'is not', null)
      .where('rejected_at', '<', cutoff as any)
      .execute();

    for (const r of expired) {
      await this.deleteReportCompletely(r.id, 'Refus non corrigé dans le délai imparti');
    }
    if (expired.length) this.logger.log(`${expired.length} signalement(s) refusé(s) non corrigé(s) supprimé(s).`);
  }

  /** Étape 2 — signalements publiés sans confirmation de fraîcheur depuis
   * le délai d'avertissement : courriel de rappel avec lien de confirmation
   * à usage unique. */
  private async sendStalenessReminders(days: LifecycleDays) {
    const cutoff = new Date(Date.now() - days.stalenessWarningDays * 86400000);
    const stale = await this.db
      .selectFrom('reports')
      .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .leftJoin('users', 'users.id', 'reports.user_id')
      .select(['reports.id', 'reports.address_text', 'reports.created_at', 'users.email', 'users.first_name', 'problem_types.name_fr as problemTypeNameFr',
        sql<string | null>`(SELECT url FROM report_photos WHERE report_photos.report_id = reports.id ORDER BY uploaded_at ASC LIMIT 1)`.as('photoUrl'),
      ])
      .where('reports.status', 'in', ['published_unresolved', 'published_resolved'])
      .where('reports.last_confirmed_at', 'is not', null)
      .where('reports.last_confirmed_at', '<', cutoff as any)
      .where('reports.staleness_reminder_sent_at', 'is', null)
      .execute();

    for (const r of stale) {
      const token = randomBytes(24).toString('hex');
      const expiresAt = new Date(Date.now() + days.stalenessDeadlineDays * 86400000 + 2 * 86400000); // marge de 2 jours
      await this.db
        .insertInto('report_confirmation_tokens')
        .values({ report_id: r.id, token, expires_at: expiresAt as any })
        .execute();

      await this.db
        .updateTable('reports')
        .set({ staleness_reminder_sent_at: new Date() as any })
        .where('id', '=', r.id)
        .execute();

      if (r.email) {
        const reportUrl = `${this.frontendUrl()}/?report=${r.id}`;
        this.email
          .sendTemplated(
            'staleness_reminder',
            r.email,
            {
              firstName: r.first_name ?? '',
              reportType: r.problemTypeNameFr,
              reportDate: new Date(r.created_at as any).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' }),
              reportAddress: r.address_text ?? 'Position GPS',
              reportPhotoUrl: r.photoUrl ?? '',
              warningDays: String(days.stalenessWarningDays),
              deadlineDays: String(days.stalenessDeadlineDays),
              reportUrl,
            },
            { ctaLabel: 'Confirmer que le problème existe toujours', ctaUrl: `${this.frontendUrl()}/api/reports/confirm-via-token/${token}` },
          )
          .catch(() => {});
      }
    }
    if (stale.length) this.logger.log(`${stale.length} rappel(s) de validité envoyé(s).`);
  }

  /** Étape 3 — le rappel a été envoyé et le délai final s'est écoulé sans
   * nouvelle confirmation : archivage (retiré de la carte publique, mais
   * conservé — pas une suppression). */
  private async archiveStaleReports(days: LifecycleDays) {
    const cutoff = new Date(Date.now() - days.stalenessDeadlineDays * 86400000);
    const toArchive = await this.db
      .selectFrom('reports')
      .select('id')
      .where('status', 'in', ['published_unresolved', 'published_resolved'])
      .where('staleness_reminder_sent_at', 'is not', null)
      .where('staleness_reminder_sent_at', '<', cutoff as any)
      .execute();

    for (const r of toArchive) {
      await this.db
        .updateTable('reports')
        .set({ status: 'archived', archived_at: new Date() as any })
        .where('id', '=', r.id)
        .execute();

      await this.db
        .insertInto('report_status_history')
        .values({
          report_id: r.id,
          old_status: 'published_unresolved',
          new_status: 'archived',
          changed_by: null,
          reason: 'Aucune confirmation de validité reçue dans les délais — archivage automatique.',
        })
        .execute();
    }
    if (toArchive.length) this.logger.log(`${toArchive.length} signalement(s) archivé(s) automatiquement.`);
  }

  /** Étape 4 — archives expirées (au-delà de la durée de conservation
   * configurée) : suppression définitive, photos comprises. */
  private async deleteExpiredArchives(days: LifecycleDays) {
    const cutoff = new Date(Date.now() - days.archiveRetentionYears * 365 * 86400000);
    const expired = await this.db
      .selectFrom('reports')
      .select('id')
      .where('status', '=', 'archived')
      .where('archived_at', 'is not', null)
      .where('archived_at', '<', cutoff as any)
      .execute();

    for (const r of expired) {
      await this.deleteReportCompletely(r.id, "Durée de conservation d'archive dépassée");
    }
    if (expired.length) this.logger.log(`${expired.length} archive(s) expirée(s) supprimée(s) définitivement.`);
  }

  /** Suppression complète et irréversible d'un signalement : fichiers dans
   * le stockage, puis la ligne elle-même (les tables liées suivent en
   * cascade — voir les contraintes ON DELETE CASCADE du schéma). */
  private async deleteReportCompletely(reportId: string, reason: string) {
    const photos = await this.db.selectFrom('report_photos').select('storage_key').where('report_id', '=', reportId).execute();
    if (photos.length) await this.uploads.deleteObjects(photos.map((p) => p.storage_key));

    await this.db.deleteFrom('reports').where('id', '=', reportId).execute();
    this.logger.log(`Signalement ${reportId} supprimé définitivement — ${reason}`);
  }
}
