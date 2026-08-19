import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { formatDisplayName } from '../../common/display-name.util';
import { NotificationsService } from '../notifications/notifications.service';
import { MessagingGateway } from './messaging.gateway';

@Injectable()
export class MessagingService {
  constructor(
    @Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>,
    private readonly notifications: NotificationsService,
    private readonly gateway: MessagingGateway,
  ) {}

  async findMyConversations(userId: string) {
    const rows = await this.db
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
        'users.avatar_url as otherUserAvatarUrl', 'users.privacy_settings as otherUserPrivacySettings',
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

    return rows.map((r) => ({
      ...r,
      otherUserDisplayName: formatDisplayName(
        r.otherUserFirstName,
        r.otherUserLastName,
        (r.otherUserPrivacySettings as any)?.last_name_display,
        r.otherUserEmail,
      ),
    }));
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

    // Marque comme lus tous les messages de l'AUTRE personne — jamais les
    // siens, pas de sens de se marquer soi-même comme "lu".
    await this.db
      .updateTable('direct_messages')
      .set({ read_at: new Date() as any })
      .where('conversation_id', '=', conversationId)
      .where('sender_id', '!=', userId)
      .where('read_at', 'is', null)
      .execute();

    const messages = await this.db
      .selectFrom('direct_messages')
      .innerJoin('users', 'users.id', 'direct_messages.sender_id')
      .select(['direct_messages.id', 'direct_messages.message', 'direct_messages.sender_id as senderId', 'direct_messages.created_at', 'users.email as senderEmail'])
      .where('direct_messages.conversation_id', '=', conversationId)
      .orderBy('direct_messages.created_at', 'asc')
      .execute();

    const messageIds = messages.map((m) => m.id);
    const reactions = messageIds.length > 0
      ? await this.db
          .selectFrom('message_reactions')
          .select(['message_id as messageId', 'user_id as userId', 'emoji'])
          .where('message_id', 'in', messageIds)
          .execute()
      : [];

    return messages.map((m) => ({
      ...m,
      reactions: reactions.filter((r) => r.messageId === m.id),
    }));
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

  /** Ajoute ou retire une réaction (bascule) — cliquer deux fois sur le
   * même emoji la retire, comme Messenger. */
  async toggleReaction(messageId: string, userId: string, emoji: string) {
    const existing = await this.db
      .selectFrom('message_reactions')
      .select('id')
      .where('message_id', '=', messageId)
      .where('user_id', '=', userId)
      .where('emoji', '=', emoji)
      .executeTakeFirst();

    if (existing) {
      await this.db.deleteFrom('message_reactions').where('id', '=', existing.id).execute();
      return { added: false };
    }

    await this.db.insertInto('message_reactions').values({ message_id: messageId, user_id: userId, emoji }).execute();
    return { added: true };
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
      // Kysely génère du SQL invalide (« INSERT INTO conversations ()
      // VALUES () ») avec un objet .values({}) vide — conversations n'a
      // pourtant aucune colonne à fournir (id et created_at sont tous les
      // deux générés automatiquement). DEFAULT VALUES est la syntaxe SQL
      // correcte pour ce cas précis, via sql brut plutôt que le
      // constructeur de requêtes habituel.
      const conversation = await sql<{ id: string }>`
        INSERT INTO conversations DEFAULT VALUES RETURNING id
      `.execute(trx).then((r) => r.rows[0]);

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
        .returning(['id', 'conversation_id', 'sender_id as senderId', 'message', 'created_at', 'read_at'])
        .executeTakeFirstOrThrow();

      return { conversationId: conversation.id, message };
    }).then(async (result) => {
      await this.notifyNewMessage(toUserId, fromUserId, firstMessage);
      this.gateway.notifyNewMessage(toUserId, result.conversationId, result.message);
      return result;
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

    const newMessage = await this.db
      .insertInto('direct_messages')
      .values({ conversation_id: conversationId, sender_id: senderId, message })
      .returning(['id', 'conversation_id', 'sender_id as senderId', 'message', 'created_at', 'read_at'])
      .executeTakeFirstOrThrow();

    if (otherUserId) {
      await this.notifyNewMessage(otherUserId, senderId, message);
      this.gateway.notifyNewMessage(otherUserId, conversationId, newMessage);
    }

    return newMessage;
  }

  /** Notification avec l'avatar de l'expéditeur et un aperçu du message
   * (150 caractères) — actorId permet au frontend de retrouver l'avatar
   * via la jointure déjà en place dans NotificationsService.findMine(). */
  private async notifyNewMessage(toUserId: string, fromUserId: string, message: string) {
    const sender = await this.db.selectFrom('users').select(['first_name', 'email', 'privacy_settings']).where('id', '=', fromUserId).executeTakeFirst();
    if (!sender) return;
    const senderName = formatDisplayName(sender.first_name, null, undefined, sender.email);
    const preview = message.length > 150 ? `${message.slice(0, 150)}…` : message;
    await this.notifications.create({
      userId: toUserId,
      type: 'direct_message_received',
      actorId: fromUserId,
      title: `Nouveau message de ${senderName}`,
      body: preview,
    });
  }

  async blockUser(blockerId: string, blockedId: string) {
    await this.db
      .insertInto('user_blocks')
      .values({ blocker_id: blockerId, blocked_id: blockedId })
      .onConflict((oc) => oc.doNothing())
      .execute();
    return { blocked: true };
  }

  /** Messages signalés comme abusifs, non encore traités — pour la
   * modération. Regroupe le message lui-même avec son expéditeur, la
   * personne qui l'a signalé et le motif. */
  async findFlaggedMessages() {
    return this.db
      .selectFrom('message_flags')
      .innerJoin('direct_messages', 'direct_messages.id', 'message_flags.message_id')
      .innerJoin('users as sender', 'sender.id', 'direct_messages.sender_id')
      .innerJoin('users as flagger', 'flagger.id', 'message_flags.flagged_by')
      .select([
        'message_flags.id as flagId', 'message_flags.reason', 'message_flags.created_at as flaggedAt',
        'direct_messages.id as messageId', 'direct_messages.message', 'direct_messages.created_at as messageCreatedAt',
        'direct_messages.conversation_id as conversationId',
        'sender.id as senderId', 'sender.email as senderEmail',
        'flagger.email as flaggerEmail',
      ])
      .where('message_flags.handled_at', 'is', null)
      .orderBy('message_flags.created_at', 'desc')
      .execute();
  }

  /** Rejette le signalement sans action — le modérateur juge que le
   * message n'enfreint rien. */
  async dismissMessageFlag(flagId: string, moderatorId: string) {
    await this.db
      .updateTable('message_flags')
      .set({ handled_at: new Date() as any, handled_by: moderatorId })
      .where('id', '=', flagId)
      .execute();
    return { dismissed: true };
  }

  /** Supprime le message signalé (son contenu devient invisible pour les
   * deux participants) ET bloque son expéditeur de façon permanente —
   * réservé aux cas confirmés d'abus par la modération. */
  async removeMessageAndBanSender(flagId: string, moderatorId: string) {
    const flag = await this.db
      .selectFrom('message_flags')
      .innerJoin('direct_messages', 'direct_messages.id', 'message_flags.message_id')
      .select(['direct_messages.id as messageId', 'direct_messages.sender_id as senderId'])
      .where('message_flags.id', '=', flagId)
      .executeTakeFirst();
    if (!flag) throw new NotFoundException('Signalement introuvable.');

    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('direct_messages')
        .set({ message: '[Message retiré par la modération]' })
        .where('id', '=', flag.messageId)
        .execute();
      await trx
        .updateTable('users')
        .set({ status: 'suspended' })
        .where('id', '=', flag.senderId)
        .execute();
      await trx
        .updateTable('message_flags')
        .set({ handled_at: new Date() as any, handled_by: moderatorId })
        .where('id', '=', flagId)
        .execute();
    });

    return { removed: true, senderSuspended: true };
  }

}
