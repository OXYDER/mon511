import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';

@Injectable()
export class MessagingService {
  constructor(@Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>) {}

  async findMyConversations(userId: string) {
    return this.db
      .selectFrom('conversation_participants as me')
      .innerJoin('conversation_participants as other', (join) =>
        join
          .onRef('other.conversation_id', '=', 'me.conversation_id')
          .on('other.user_id', '!=', userId),
      )
      .innerJoin('users', 'users.id', 'other.user_id')
      .select(['me.conversation_id', 'users.id as otherUserId', 'users.email as otherUserEmail'])
      .where('me.user_id', '=', userId)
      .execute();
  }

  async findMessages(conversationId: string) {
    return this.db
      .selectFrom('direct_messages')
      .selectAll()
      .where('conversation_id', '=', conversationId)
      .orderBy('created_at', 'asc')
      .execute();
  }

  /**
   * Démarre une conversation, en respectant users.privacy_settings.dm_permission
   * du destinataire (§15 du modèle de données) : `everyone` ou
   * `shared_reports_only` (nécessite un signalement en commun via confirmation,
   * commentaire, ou suggestion de résolution).
   */
  async startConversation(fromUserId: string, toUserId: string, firstMessage: string) {
    const blocked = await this.db
      .selectFrom('user_blocks')
      .select('blocker_id')
      .where('blocker_id', '=', toUserId)
      .where('blocked_id', '=', fromUserId)
      .executeTakeFirst();
    if (blocked) throw new ForbiddenException('Cet usager ne peut pas être contacté.');

    const recipient = await this.db
      .selectFrom('users')
      .select('privacy_settings')
      .where('id', '=', toUserId)
      .executeTakeFirstOrThrow();

    if (recipient.privacy_settings.dm_permission === 'shared_reports_only') {
      const sharedReport = await this.db
        .selectFrom('reports')
        .select('id')
        .where('user_id', '=', toUserId)
        .where((eb) =>
          eb.exists(
            eb
              .selectFrom('report_confirmations')
              .select('id')
              .whereRef('report_confirmations.report_id', '=', 'reports.id')
              .where('report_confirmations.user_id', '=', fromUserId),
          ),
        )
        .executeTakeFirst();

      if (!sharedReport) {
        throw new ForbiddenException(
          'Cet usager limite les messages privés aux personnes avec qui il partage un signalement.',
        );
      }
    }

    return this.db.transaction().execute(async (trx) => {
      const conversation = await trx
        .insertInto('conversations')
        .values({})
        .returning('id')
        .executeTakeFirstOrThrow();

      await trx
        .insertInto('conversation_participants')
        .values([
          { conversation_id: conversation.id, user_id: fromUserId },
          { conversation_id: conversation.id, user_id: toUserId },
        ])
        .execute();

      const message = await trx
        .insertInto('direct_messages')
        .values({ conversation_id: conversation.id, sender_id: fromUserId, message: firstMessage })
        .returningAll()
        .executeTakeFirstOrThrow();

      return { conversationId: conversation.id, message };
    });
  }

  async sendMessage(conversationId: string, senderId: string, message: string) {
    return this.db
      .insertInto('direct_messages')
      .values({ conversation_id: conversationId, sender_id: senderId, message })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async blockUser(blockerId: string, blockedId: string) {
    await this.db
      .insertInto('user_blocks')
      .values({ blocker_id: blockerId, blocked_id: blockedId })
      .onConflict((oc) => oc.doNothing())
      .execute();
    return { blocked: true };
  }
}
