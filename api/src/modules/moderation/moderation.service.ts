import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { ModerationDecisionDto } from './dto/moderation-decision.dto';

@Injectable()
export class ModerationService {
  constructor(@Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>) {}

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
}
