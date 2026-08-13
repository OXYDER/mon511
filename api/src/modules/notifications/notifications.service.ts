import { Inject, Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';

@Injectable()
export class NotificationsService {
  constructor(@Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>) {}

  /** Alimente l'onglet Alertes de la maquette mobile — enrichi avec les
   * informations de base du signalement lié (type, adresse, première
   * photo) pour qu'on sache de quoi on parle sans devoir cliquer. */
  async findMine(userId: string) {
    return this.db
      .selectFrom('notifications')
      .leftJoin('reports', 'reports.id', 'notifications.report_id')
      .leftJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .select([
        'notifications.id', 'notifications.type', 'notifications.report_id as reportId',
        'notifications.title', 'notifications.body', 'notifications.read_at as readAt',
        'notifications.created_at as createdAt',
        'reports.address_text as reportAddressText',
        'problem_types.name_fr as reportProblemTypeNameFr',
        'problem_types.name_en as reportProblemTypeNameEn',
        'problem_types.icon as reportProblemTypeIcon',
        sql<string | null>`(SELECT url FROM report_photos WHERE report_photos.report_id = reports.id ORDER BY uploaded_at ASC LIMIT 1)`.as('reportThumbnailUrl'),
      ])
      .where('notifications.user_id', '=', userId)
      .orderBy('notifications.created_at', 'desc')
      .limit(100)
      .execute();
  }

  async markAllRead(userId: string) {
    await this.db
      .updateTable('notifications')
      .set({ read_at: new Date() as any })
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .execute();
    return { success: true };
  }

  async unreadCount(userId: string) {
    const result = await this.db
      .selectFrom('notifications')
      .select(({ fn }) => fn.count<number>('id').as('count'))
      .where('user_id', '=', userId)
      .where('read_at', 'is', null)
      .executeTakeFirst();
    return result?.count ?? 0;
  }

  async markRead(id: string, userId: string) {
    await this.db
      .updateTable('notifications')
      .set({ read_at: new Date() as any })
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .execute();
    return { success: true };
  }

  /** Créée par les autres services (résolution suggérée, refus, réponse modérateur...). */
  async create(params: {
    userId: string;
    type: string;
    reportId?: string;
    actorId?: string;
    title: string;
    body?: string;
  }) {
    return this.db
      .insertInto('notifications')
      .values({
        user_id: params.userId,
        type: params.type,
        report_id: params.reportId ?? null,
        actor_id: params.actorId ?? null,
        title: params.title,
        body: params.body ?? null,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
