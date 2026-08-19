import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { formatDisplayName } from '../../common/display-name.util';
import { NotificationsService } from '../notifications/notifications.service';

@Injectable()
export class FriendsService {
  constructor(
    @Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>,
    private readonly notifications: NotificationsService,
  ) {}

  /** Envoie une demande d'ami par courriel — l'usager visé doit déjà avoir
   * un compte mon511 avec ce courriel. */
  async sendRequest(fromUserId: string, toEmail: string) {
    const target = await this.db.selectFrom('users').select('id').where('email', '=', toEmail).executeTakeFirst();
    if (!target) throw new NotFoundException("Aucun compte mon511 n'utilise ce courriel.");
    if (target.id === fromUserId) throw new BadRequestException("Tu ne peux pas t'ajouter toi-même.");

    // Une demande dans l'autre sens existe déjà (l'autre personne t'a
    // déjà invité) — on l'accepte directement plutôt que de créer une
    // deuxième demande en double, sans intérêt pour l'usager.
    const reverseRequest = await this.db
      .selectFrom('friendships')
      .selectAll()
      .where('requester_id', '=', target.id)
      .where('addressee_id', '=', fromUserId)
      .executeTakeFirst();
    if (reverseRequest) {
      if (reverseRequest.status === 'accepted') throw new BadRequestException('Vous êtes déjà amis.');
      return this.respond(reverseRequest.id, fromUserId, true);
    }

    const existing = await this.db
      .selectFrom('friendships')
      .selectAll()
      .where('requester_id', '=', fromUserId)
      .where('addressee_id', '=', target.id)
      .executeTakeFirst();
    if (existing) {
      if (existing.status === 'accepted') throw new BadRequestException('Vous êtes déjà amis.');
      if (existing.status === 'pending') throw new BadRequestException('Une demande est déjà en attente.');
      // Refusée précédemment — on permet de retenter, remet en attente.
      await this.db.updateTable('friendships').set({ status: 'pending', responded_at: null }).where('id', '=', existing.id).execute();
      return { requested: true };
    }

    const friendship = await this.db
      .insertInto('friendships')
      .values({ requester_id: fromUserId, addressee_id: target.id })
      .returning('id')
      .executeTakeFirstOrThrow();

    const requester = await this.db.selectFrom('users').select(['first_name', 'email']).where('id', '=', fromUserId).executeTakeFirst();
    await this.notifications.create({
      userId: target.id,
      type: 'friend_request',
      title: "Nouvelle demande d'ami",
      body: `${requester?.first_name ?? requester?.email ?? 'Quelqu\'un'} souhaite t'ajouter comme ami sur mon511.`,
    });

    return { requested: true, friendshipId: friendship.id };
  }

  async respond(friendshipId: string, userId: string, accept: boolean) {
    const friendship = await this.db.selectFrom('friendships').selectAll().where('id', '=', friendshipId).executeTakeFirst();
    if (!friendship) throw new NotFoundException('Demande introuvable.');
    if (friendship.addressee_id !== userId) throw new ForbiddenException("Cette demande ne t'est pas adressée.");

    await this.db
      .updateTable('friendships')
      .set({ status: accept ? 'accepted' : 'declined', responded_at: new Date() as any })
      .where('id', '=', friendshipId)
      .execute();

    if (accept) {
      const addressee = await this.db.selectFrom('users').select(['first_name', 'email']).where('id', '=', userId).executeTakeFirst();
      await this.notifications.create({
        userId: friendship.requester_id,
        type: 'friend_accepted',
        title: "Demande d'ami acceptée",
        body: `${addressee?.first_name ?? addressee?.email ?? 'Quelqu\'un'} a accepté ta demande d'ami.`,
      });
    }

    return { accepted: accept };
  }

  /** Retire un ami existant, ou annule une demande envoyée en attente —
   * l'un ou l'autre participant peut le faire, peu importe qui a envoyé
   * la demande au départ. */
  async remove(friendshipId: string, userId: string) {
    const friendship = await this.db.selectFrom('friendships').selectAll().where('id', '=', friendshipId).executeTakeFirst();
    if (!friendship) return { removed: true };
    if (friendship.requester_id !== userId && friendship.addressee_id !== userId) {
      throw new ForbiddenException('Cette relation ne te concerne pas.');
    }
    await this.db.deleteFrom('friendships').where('id', '=', friendshipId).execute();
    return { removed: true };
  }

  async findMyFriends(userId: string) {
    const asRequester = await this.db
      .selectFrom('friendships')
      .innerJoin('users', 'users.id', 'friendships.addressee_id')
      .select([
        'friendships.id as friendshipId', 'friendships.created_at',
        'users.id as friendUserId', 'users.email as friendEmail', 'users.first_name as friendFirstName',
        'users.last_name as friendLastName', 'users.avatar_url as friendAvatarUrl',
        'users.privacy_settings as friendPrivacySettings', 'users.last_active_at as friendLastActiveAt',
      ])
      .where('friendships.requester_id', '=', userId)
      .where('friendships.status', '=', 'accepted')
      .execute();

    const asAddressee = await this.db
      .selectFrom('friendships')
      .innerJoin('users', 'users.id', 'friendships.requester_id')
      .select([
        'friendships.id as friendshipId', 'friendships.created_at',
        'users.id as friendUserId', 'users.email as friendEmail', 'users.first_name as friendFirstName',
        'users.last_name as friendLastName', 'users.avatar_url as friendAvatarUrl',
        'users.privacy_settings as friendPrivacySettings', 'users.last_active_at as friendLastActiveAt',
      ])
      .where('friendships.addressee_id', '=', userId)
      .where('friendships.status', '=', 'accepted')
      .execute();

    // "En ligne" est une approximation — pas de vraie infrastructure
    // temps réel (WebSocket), juste une activité authentifiée dans les 5
    // dernières minutes. Suffisant pour donner une idée générale sans le
    // coût/la complexité d'un vrai système de présence.
    const ONLINE_THRESHOLD_MS = 5 * 60 * 1000;
    return [...asRequester, ...asAddressee]
      .map((f) => ({
        ...f,
        friendDisplayName: formatDisplayName(f.friendFirstName, f.friendLastName, (f.friendPrivacySettings as any)?.last_name_display, f.friendEmail),
        friendOnline: f.friendLastActiveAt ? Date.now() - new Date(f.friendLastActiveAt).getTime() < ONLINE_THRESHOLD_MS : false,
      }))
      .sort((a, b) => a.friendDisplayName.localeCompare(b.friendDisplayName, 'fr-CA'));
  }

  /** Demandes reçues en attente de réponse. */
  async findPendingReceived(userId: string) {
    const rows = await this.db
      .selectFrom('friendships')
      .innerJoin('users', 'users.id', 'friendships.requester_id')
      .select([
        'friendships.id as friendshipId', 'friendships.created_at',
        'users.id as fromUserId', 'users.email as fromEmail', 'users.first_name as fromFirstName',
        'users.last_name as fromLastName', 'users.avatar_url as fromAvatarUrl',
        'users.privacy_settings as fromPrivacySettings',
      ])
      .where('friendships.addressee_id', '=', userId)
      .where('friendships.status', '=', 'pending')
      .orderBy('friendships.created_at', 'desc')
      .execute();

    return rows.map((r) => ({
      ...r,
      fromDisplayName: formatDisplayName(r.fromFirstName, r.fromLastName, (r.fromPrivacySettings as any)?.last_name_display, r.fromEmail),
    }));
  }

  /** Demandes envoyées, toujours en attente — pour pouvoir les annuler. */
  async findPendingSent(userId: string) {
    return this.db
      .selectFrom('friendships')
      .innerJoin('users', 'users.id', 'friendships.addressee_id')
      .select(['friendships.id as friendshipId', 'friendships.created_at', 'users.email as toEmail'])
      .where('friendships.requester_id', '=', userId)
      .where('friendships.status', '=', 'pending')
      .orderBy('friendships.created_at', 'desc')
      .execute();
  }

  /** Signalements publiés de tous mes amis — pour la couche "Signalements
   * de mes amis" sur la carte. */
  async findFriendsReports(userId: string) {
    const friends = await this.findMyFriends(userId);
    const friendIds = friends.map((f) => f.friendUserId);
    if (friendIds.length === 0) return [];

    return this.db
      .selectFrom('reports')
      .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .select([
        'reports.id', 'reports.status',
        sql<number>`ST_Y(reports.location::geometry)`.as('latitude'),
        sql<number>`ST_X(reports.location::geometry)`.as('longitude'),
        'reports.address_text as addressText', 'reports.user_id as userId', 'reports.created_at',
        'problem_types.name_fr as problemTypeNameFr', 'problem_types.name_en as problemTypeNameEn',
        'problem_types.icon as problemTypeIcon',
      ])
      .where('reports.user_id', 'in', friendIds)
      .where('reports.status', 'in', ['published_unresolved', 'published_resolved'])
      .orderBy('reports.created_at', 'desc')
      .execute();
  }
}
