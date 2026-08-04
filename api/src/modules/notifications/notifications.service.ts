import { Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';

@Injectable()
export class NotificationsService {
  constructor(@Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>) {}

  /** Alimente l'onglet Alertes de la maquette mobile. */
  async findMine(userId: string) {
    return this.db
      .selectFrom('notifications')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('created_at', 'desc')
      .limit(100)
      .execute();
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
    return this.db
      .updateTable('notifications')
      .set({ read_at: new Date() as any })
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .execute();
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
