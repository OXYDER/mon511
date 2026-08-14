import { ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
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
      .select([
        'me.conversation_id', 'other.user_id as otherUserId', 'users.email as otherUserEmail',
        'users.first_name as otherUserFirstName', 'users.last_name as otherUserLastName',
        'users.avatar_url as otherUserAvatarUrl',
        (eb) => eb
          .selectFrom('direct_messages')
          .select('message')
          .whereRef('direct_messages.conversation_id', '=', 'me.conversation_id')
          .orderBy('direct_messages.created_at', 'desc')
          .limit(1)
          .as('lastMessage'),
        (eb) => eb
          .selectFrom('direct_messages')
          .select('created_at')
          .whereRef('direct_messages.conversation_id', '=', 'me.conversation_id')
          .orderBy('direct_messages.created_at', 'desc')
          .limit(1)
          .as('lastMessageAt'),
        (eb) => eb
          .selectFrom('direct_messages')
          .select(({ fn }) => fn.count<number>('id').as('count'))
          .whereRef('direct_messages.conversation_id', '=', 'me.conversation_id')
          .where('direct_messages.sender_id', '!=', userId)
          .where('direct_messages.read_at', 'is', null)
          .as('unreadCount'),
      ])
      .orderBy('lastMessageAt', 'desc')
      .where('me.user_id', '=', userId)
      .execute();
  }

  async findMessages(conversationId: string, userId: string) {
    // Vérifie que l'usager fait bien partie de la conversation avant de
    // lui montrer quoi que ce soit — sans ça, n'importe quel usager
    // connecté pourrait lire les messages de n'importe qui en devinant un
    // identifiant de conversation.
    const participant = await this.db
      .selectFrom('conversation_participants')
      .select('user_id')
      .where('conversation_id', '=', conversationId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!participant) throw new ForbiddenException("Tu ne fais pas partie de cette conversation.");

    const messages = await this.db
      .selectFrom('direct_messages')
      .innerJoin('users', 'users.id', 'direct_messages.sender_id')
      .select(['direct_messages.id', 'direct_messages.message', 'direct_messages.sender_id as senderId', 'direct_messages.created_at', 'users.email as senderEmail'])
      .where('direct_messages.conversation_id', '=', conversationId)
      .orderBy('direct_messages.created_at', 'asc')
      .execute();

    // Marque comme lus tous les messages de l'AUTRE personne — jamais les
    // siens, pas de sens de se marquer soi-même comme "lu".
    await this.db
      .updateTable('direct_messages')
      .set({ read_at: new Date() as any })
      .where('conversation_id', '=', conversationId)
      .where('sender_id', '!=', userId)
      .where('read_at', 'is', null)
      .execute();

    return messages;
  }

  async getUnreadCount(userId: string) {
    const result = await this.db
      .selectFrom('direct_messages')
      .innerJoin('conversation_participants', (join) =>
        join
          .onRef('conversation_participants.conversation_id', '=', 'direct_messages.conversation_id')
          .on('conversation_participants.user_id', '=', userId),
      )
      .select(({ fn }) => fn.count<number>('direct_messages.id').as('count'))
      .where('direct_messages.sender_id', '!=', userId)
      .where('direct_messages.read_at', 'is', null)
      .executeTakeFirst();
    return result?.count ?? 0;
  }

  /** Signale un message abusif — la modération pourra le traiter comme les
   * autres signalements d'abus (même esprit que message_flags pour les
   * signalements de route, table dédiée mais même logique). */
  async flagMessage(messageId: string, userId: string, reason?: string) {
    await this.db
      .insertInto('message_flags')
      .values({ message_id: messageId, flagged_by: userId, reason: reason ?? null })
      .execute();
    return { flagged: true };
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
    // Même vérification d'appartenance que findMessages — sans ça,
    // n'importe quel usager pourrait écrire dans une conversation à
    // laquelle il n'appartient pas en devinant son identifiant.
    const participants = await this.db
      .selectFrom('conversation_participants')
      .select('user_id')
      .where('conversation_id', '=', conversationId)
      .execute();
    if (!participants.some((p) => p.user_id === senderId)) {
      throw new ForbiddenException("Tu ne fais pas partie de cette conversation.");
    }

    // Si l'autre personne a bloqué l'expéditeur ENTRE-TEMPS (après le
    // début de la conversation), ses messages suivants ne doivent plus
    // passer, même si la conversation existe déjà.
    const otherUserId = participants.find((p) => p.user_id !== senderId)?.user_id;
    if (otherUserId) {
      const blocked = await this.db
        .selectFrom('user_blocks')
        .select('blocker_id')
        .where('blocker_id', '=', otherUserId)
        .where('blocked_id', '=', senderId)
        .executeTakeFirst();
      if (blocked) throw new ForbiddenException('Cet usager ne peut plus être contacté.');
    }

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
