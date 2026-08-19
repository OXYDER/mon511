import { MessageBody, ConnectedSocket, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { Injectable, Logger, Inject } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { Kysely } from 'kysely';
import { JwtService } from '@nestjs/jwt';
import { JwtPayload } from '../../auth/strategies/jwt.strategy';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';

/** Passerelle WebSocket pour la messagerie privée — pousse les nouveaux
 * messages instantanément aux destinataires connectés, plutôt que de
 * compter uniquement sur le sondage périodique (polling) du frontend.
 *
 * Authentification : réutilise le même jeton JWT que le reste du site
 * (envoyé comme paramètre de connexion plutôt qu'un en-tête HTTP, la
 * norme pour les WebSocket) — pas de nouveau système d'authentification
 * à maintenir séparément.
 *
 * CORS ouvert ici volontairement (comme le reste de l'API, déjà
 * accessible publiquement) — la vraie protection reste la validation du
 * jeton à la connexion, pas l'origine de la requête. */
@Injectable()
@WebSocketGateway({ cors: { origin: '*' }, path: '/socket.io' })
export class MessagingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(MessagingGateway.name);
  // Un usager peut avoir plusieurs onglets/appareils connectés en même
  // temps — on garde donc un ENSEMBLE de connexions par usager, pas une
  // seule.
  private readonly userSockets = new Map<string, Set<string>>();

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly jwt: JwtService,
    @Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>,
  ) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwt.verify<JwtPayload>(token);
      client.data.userId = payload.sub;
      const sockets = this.userSockets.get(payload.sub) ?? new Set();
      sockets.add(client.id);
      this.userSockets.set(payload.sub, sockets);
    } catch {
      // Jeton invalide ou expiré — refusé silencieusement, le frontend
      // se rabat déjà sur le sondage périodique dans ce cas.
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;
    const sockets = this.userSockets.get(userId);
    sockets?.delete(client.id);
    if (sockets && sockets.size === 0) this.userSockets.delete(userId);
  }

  /** Pousse un nouveau message à un usager précis, sur TOUTES ses
   * connexions actives (plusieurs onglets/appareils) — n'envoie rien si
   * la personne n'est pas connectée en ce moment (le sondage périodique
   * prendra le relais à sa prochaine visite). */
  notifyNewMessage(userId: string, conversationId: string, message: any) {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) return;
    for (const socketId of sockets) {
      this.server.to(socketId).emit('new-message', { conversationId, message });
    }
  }

  /** Bulle flottante style Teams — avatar, nom et aperçu déjà inclus,
   * pour s'afficher peu importe où l'usager se trouve sur le site, sans
   * appel supplémentaire au serveur pour obtenir ces infos. */
  notifyMessageToast(userId: string, toast: { conversationId: string; senderId: string; senderName: string; senderAvatarUrl: string | null; preview: string }) {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) return;
    for (const socketId of sockets) {
      this.server.to(socketId).emit('message-toast', toast);
    }
  }

  /** Pousse un ajout/retrait de réaction à un usager précis — même
   * mécanisme que notifyNewMessage(), silencieux si la personne n'est
   * pas connectée en ce moment. */
  notifyReaction(userId: string, messageId: string, reactorUserId: string, emoji: string, added: boolean) {
    const sockets = this.userSockets.get(userId);
    if (!sockets || sockets.size === 0) return;
    for (const socketId of sockets) {
      this.server.to(socketId).emit('message-reaction', { messageId, userId: reactorUserId, emoji, added });
    }
  }

  /** Accusé de lecture en direct — pousse à l'EXPÉDITEUR des messages
   * concernés (pas au lecteur lui-même) la confirmation que ses messages
   * viennent d'être lus, pour que le petit crochet passe instantanément
   * de "envoyé" à "lu" sans attendre le prochain sondage périodique. */
  notifyMessagesRead(senderUserId: string, conversationId: string, messageIds: string[]) {
    const sockets = this.userSockets.get(senderUserId);
    if (!sockets || sockets.size === 0) return;
    for (const socketId of sockets) {
      this.server.to(socketId).emit('messages-read', { conversationId, messageIds });
    }
  }

  /** Vrai statut de connexion — reflète immédiatement une déconnexion
   * (contrairement à une approximation basée sur la dernière activité,
   * qui pouvait rester "en ligne" jusqu'à plusieurs minutes après une
   * vraie déconnexion). */
  isUserOnline(userId: string): boolean {
    const sockets = this.userSockets.get(userId);
    return !!sockets && sockets.size > 0;
  }

  /** Relais "en train d'écrire…" — purement éphémère, jamais écrit en
   * base (contrairement aux messages eux-mêmes), juste transmis en
   * direct à l'autre participant de la conversation s'il est connecté.
   * Le frontend renvoie régulièrement cet événement tant que la personne
   * tape, et s'arrête (ou le client considère l'indicateur périmé après
   * quelques secondes sans nouvel envoi) dès qu'elle arrête. */
  @SubscribeMessage('typing')
  async handleTyping(@ConnectedSocket() client: Socket, @MessageBody() data: { conversationId: string }) {
    const userId = client.data.userId as string | undefined;
    if (!userId) return;

    const otherParticipant = await this.db
      .selectFrom('conversation_participants')
      .select('user_id')
      .where('conversation_id', '=', data.conversationId)
      .where('user_id', '!=', userId)
      .executeTakeFirst();
    if (!otherParticipant) return;

    const sockets = this.userSockets.get(otherParticipant.user_id);
    if (!sockets) return;
    for (const socketId of sockets) {
      this.server.to(socketId).emit('user-typing', { conversationId: data.conversationId, userId });
    }
  }
}
