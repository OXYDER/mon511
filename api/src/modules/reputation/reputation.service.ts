import { Inject, Injectable, Logger } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';

type ReputationEventType =
  | 'report_confirmed_by_other'
  | 'report_resolved'
  | 'report_rejected'
  | 'gave_confirmation'
  | 'flag_upheld'
  | 'flag_rejected'
  | 'report_flagged_valid'
  | 'resolution_suggestion_correct';

@Injectable()
export class ReputationService {
  private readonly logger = new Logger(ReputationService.name);

  constructor(@Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>) {}

  /**
   * Attribue (ou retire) des points de réputation à un usager pour un
   * événement donné, et journalise l'événement dans reputation_events.
   * Le barème vient de site_settings.reputation_points, modifiable sans
   * redéploiement. Le score ne descend jamais sous 0.
   */
  async award(userId: string | null, eventType: ReputationEventType, relatedReportId?: string, relatedUserId?: string) {
    if (!userId) return; // signalement anonyme — rien à créditer

    try {
      const setting = await this.db
        .selectFrom('site_settings')
        .select('value')
        .where('key', '=', 'reputation_points')
        .executeTakeFirst();

      const bareme = (setting?.value as Record<string, number>) ?? {};
      const points = bareme[eventType] ?? 0;
      if (points === 0) return;

      await this.db
        .insertInto('reputation_events')
        .values({
          user_id: userId,
          event_type: eventType,
          points,
          related_report_id: relatedReportId ?? null,
          related_user_id: relatedUserId ?? null,
        })
        .execute();

      await this.db
        .updateTable('users')
        .set((eb) => ({
          reputation_score: eb.fn('GREATEST', [eb.val(0), eb('reputation_score', '+', points)]),
        }))
        .where('id', '=', userId)
        .execute();
    } catch (error) {
      // La réputation est secondaire — une erreur ici ne doit jamais faire
      // échouer l'action principale (confirmer, approuver, etc.).
      this.logger.error(`Échec de l'attribution de réputation (${eventType}) pour ${userId}`, error as Error);
    }
  }
}
