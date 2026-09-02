import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { Kysely, sql } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { EmailService } from '../../email/email.service';
import { UploadsService } from '../uploads/uploads.service';
import { formatDisplayName } from '../../common/display-name.util';

@Injectable()
export class MunicipalPortalService {
  constructor(
    @Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>,
    private readonly email: EmailService,
    private readonly uploads: UploadsService,
    private readonly jwt: JwtService,
  ) {}

  // ---------- Demande d'accès ----------

  /** Recherche publique de municipalités (par nom) — utilisée par le
   * formulaire de demande d'accès, où n'importe quel usager connecté (pas
   * nécessairement admin) doit pouvoir trouver sa propre municipalité
   * parmi les 1281 du Québec. */
  async searchRegions(search: string) {
    if (!search || search.trim().length < 2) return [];
    return this.db
      .selectFrom('regions')
      .select(['id as regionId', 'name_fr as regionNameFr'])
      .where('type', '=', 'municipality')
      .where('name_fr', 'ilike', `%${search}%`)
      .orderBy('name_fr', 'asc')
      .limit(8)
      .execute();
  }

  /** Statut d'accès au portail municipal pour l'usager courant — utilisé
   * par le frontend pour savoir quel écran montrer (formulaire de
   * demande / page d'attente / vrai portail). Trois états possibles :
   * 'none' (jamais demandé, ou demande déjà refusée), 'pending'
   * (demande envoyée, en attente de validation), 'approved' (déjà
   * municipal_staff ou municipal_admin). */
  async getMyAccessStatus(userId: string) {
    const user = await this.db
      .selectFrom('users')
      .innerJoin('roles', 'roles.id', 'users.role_id')
      .leftJoin('regions', 'regions.id', 'users.region_id')
      .select(['roles.name as roleName', 'regions.name_fr as regionName'])
      .where('users.id', '=', userId)
      .executeTakeFirst();

    if (user && (user.roleName === 'municipal_staff' || user.roleName === 'municipal_admin')) {
      return { status: 'approved' as const, role: user.roleName, regionName: user.regionName };
    }

    const pending = await this.db
      .selectFrom('municipality_access_requests')
      .innerJoin('regions', 'regions.id', 'municipality_access_requests.region_id')
      .select('regions.name_fr as regionName')
      .where('user_id', '=', userId)
      .where('status', '=', 'pending')
      .executeTakeFirst();

    if (pending) return { status: 'pending' as const, regionName: pending.regionName };

    return { status: 'none' as const };
  }

  /** Page publique d'une municipalité — accessible à tout le monde, pas
   * seulement les usagers connectés. Existe pour TOUTE municipalité dès
   * maintenant, peu importe si elle a déjà été « réclamée » par un
   * premier membre ou non — voir requestAccess() pour la façon dont ce
   * gestionnaire est attribué automatiquement, sans lien avec l'existence
   * de cette page elle-même. */
  async findPublicMunicipalityPage(regionId: string) {
    const region = await this.db.selectFrom('regions').select(['id', 'name_fr as nameFr', 'logo_url as logoUrl']).where('id', '=', regionId).where('type', '=', 'municipality').executeTakeFirst();
    if (!region) throw new NotFoundException('Municipalité introuvable.');

    const hasManager = await this.db
      .selectFrom('users')
      .innerJoin('roles', 'roles.id', 'users.role_id')
      .select('users.id')
      .where('users.region_id', '=', regionId)
      .where('roles.name', 'in', ['municipal_staff', 'municipal_admin'])
      .executeTakeFirst();

    const stats = await this.db
      .selectFrom('reports')
      .select(['status', sql<number>`count(*)`.as('count')])
      .where('region_id', '=', regionId)
      .where('status', 'in', ['published_unresolved', 'published_resolved'])
      .groupBy('status')
      .execute();

    const posts = await this.db
      .selectFrom('posts')
      .innerJoin('users', 'users.id', 'posts.author_id')
      .select([
        'posts.id', 'posts.author_id', 'posts.category', 'posts.body', 'posts.link_url as linkUrl', 'posts.created_at', 'posts.report_id as reportId',
        'users.avatar_url as authorAvatarUrl', 'users.email as authorEmail',
        'users.first_name as authorFirstName', 'users.last_name as authorLastName',
        'users.privacy_settings as authorPrivacySettings',
      ])
      .where('posts.region_id', '=', regionId)
      .where('posts.status', '=', 'published')
      .where('posts.visibility', '=', 'public')
      .orderBy('posts.created_at', 'desc')
      .limit(30)
      .execute();

    return {
      regionId: region.id,
      regionName: region.nameFr,
      logoUrl: region.logoUrl,
      hasManager: !!hasManager,
      stats: {
        unresolved: Number(stats.find((s) => s.status === 'published_unresolved')?.count ?? 0),
        resolved: Number(stats.find((s) => s.status === 'published_resolved')?.count ?? 0),
      },
      posts: posts.map((p) => ({
        ...p,
        authorDisplayName: formatDisplayName(p.authorFirstName, p.authorLastName, (p.authorPrivacySettings as any)?.last_name_display, p.authorEmail),
      })),
    };
  }

  async requestAccess(userId: string, regionId: string, jobTitle: string, message: string | undefined) {
    const existing = await this.db
      .selectFrom('municipality_access_requests')
      .selectAll()
      .where('user_id', '=', userId)
      .where('status', '=', 'pending')
      .executeTakeFirst();
    if (existing) throw new BadRequestException('Une demande est déjà en attente pour ce compte.');

    const request = await this.db
      .insertInto('municipality_access_requests')
      .values({ user_id: userId, region_id: regionId, job_title: jobTitle, message: message ?? null })
      .returningAll()
      .executeTakeFirstOrThrow();

    // L'auto-approbation du premier membre a été retirée — même la toute
    // première demande pour une municipalité doit maintenant passer par
    // une vraie validation manuelle d'un admin du site, sans exception.
    // Une approbation instantanée sans aucune vérification aurait permis
    // à n'importe qui de revendiquer n'importe quelle municipalité non
    // réclamée sans contrôle.
    const user = await this.db.selectFrom('users').select('email').where('id', '=', userId).executeTakeFirst();
    const region = await this.db.selectFrom('regions').select('name_fr').where('id', '=', regionId).executeTakeFirst();
    if (user) {
      this.email
        .send(
          user.email,
          'Demande reçue — en attente de validation — mon511.ca',
          `Ta demande d'accès au portail municipal pour ${region?.name_fr ?? 'cette municipalité'} a bien été reçue. Elle est maintenant en attente de validation par notre équipe — tu recevras un courriel dès qu'elle sera traitée.`,
        )
        .catch(() => {});
    }

    return request;
  }

  /** Logique d'approbation partagée — réutilisée par l'approbation
   * manuelle (par un admin du site, ou par le gestionnaire municipal
   * déjà en place pour cette région, pour les demandes suivant la
   * première). L'auto-approbation du premier membre a été retirée —
   * voir requestAccess() — mais cette fonction reste réutilisée pour
   * toute approbation manuelle, peu importe qui l'effectue. */
  private async applyApproval(requestId: string, targetUserId: string, regionId: string, roleName: 'municipal_staff' | 'municipal_admin', reviewerId: string) {
    // Sécurité : ne jamais écraser silencieusement le rôle d'un compte
    // admin/super_admin du site. Sans cette vérification, approuver une
    // demande d'accès municipal pour un tel compte (ex. un admin qui
    // teste le formulaire avec son propre compte) remplaçait
    // discrètement son role_id par municipal_admin/staff, lui faisant
    // perdre tout accès administratif du site — bug reel rencontre et
    // corrige dans ce projet.
    const currentRole = await this.db
      .selectFrom('users')
      .innerJoin('roles', 'roles.id', 'users.role_id')
      .select('roles.name as roleName')
      .where('users.id', '=', targetUserId)
      .executeTakeFirst();
    if (currentRole && (currentRole.roleName === 'admin' || currentRole.roleName === 'super_admin')) {
      throw new ForbiddenException(
        "Ce compte est déjà administrateur du site — impossible de lui attribuer un rôle municipal sans risquer de lui faire perdre ses droits d'administration. Utilise un autre compte pour cette demande.",
      );
    }

    const role = await this.db.selectFrom('roles').select('id').where('name', '=', roleName).executeTakeFirstOrThrow();

    await this.db.transaction().execute(async (trx) => {
      await trx.updateTable('users').set({ role_id: role.id, region_id: regionId }).where('id', '=', targetUserId).execute();
      await trx
        .updateTable('municipality_access_requests')
        .set({ status: 'approved', reviewed_at: new Date() as any, reviewed_by: reviewerId })
        .where('id', '=', requestId)
        .execute();
      await trx.insertInto('municipality_subscriptions').values({ region_id: regionId }).onConflict((oc) => oc.doNothing()).execute();
    });

    const user = await this.db.selectFrom('users').select('email').where('id', '=', targetUserId).executeTakeFirst();
    if (user) {
      this.email
        .send(user.email, 'Accès au portail municipal approuvé — mon511.ca', "Ta demande d'accès au portail municipal a été approuvée! Tu peux maintenant y accéder via portail.mon511.ca.")
        .catch(() => {});
    }
  }

  /** Statut de la propre demande de l'usager courant — pour afficher où il
   * en est (aucune demande, en attente, approuvé, refusé). */
  // ---------- Admin (approbation) ----------

  async findPendingAccessRequests(reviewerRegionId: string | null) {
    let query = this.db
      .selectFrom('municipality_access_requests')
      .innerJoin('users', 'users.id', 'municipality_access_requests.user_id')
      .innerJoin('regions', 'regions.id', 'municipality_access_requests.region_id')
      .select([
        'municipality_access_requests.id', 'municipality_access_requests.requested_role',
        'municipality_access_requests.job_title', 'municipality_access_requests.message',
        'municipality_access_requests.requested_at',
        'users.email', 'users.first_name', 'users.last_name',
        'regions.name_fr as regionName',
      ])
      .where('municipality_access_requests.status', '=', 'pending')
      .orderBy('municipality_access_requests.requested_at', 'asc');

    // reviewerRegionId non nul = appelant municipal_admin (pas admin du
    // site) — ne voit que les demandes de SA propre municipalité.
    if (reviewerRegionId) query = query.where('municipality_access_requests.region_id', '=', reviewerRegionId);

    return query.execute();
  }

  /** Approbation par un admin du site (sans restriction de région) OU par
   * le municipal_admin déjà en place pour la MÊME région que la demande —
   * c'est cette deuxième possibilité qui permet l'auto-gestion demandée :
   * plus besoin d'un admin du site pour chaque nouveau modérateur d'une
   * municipalité déjà établie. */
  async approveAccessRequest(requestId: string, reviewerId: string, reviewerIsSiteAdmin: boolean) {
    const request = await this.db.selectFrom('municipality_access_requests').selectAll().where('id', '=', requestId).executeTakeFirst();
    if (!request) throw new NotFoundException('Demande introuvable.');

    if (!reviewerIsSiteAdmin) {
      const reviewer = await this.db.selectFrom('users').select('region_id').where('id', '=', reviewerId).executeTakeFirst();
      if (reviewer?.region_id !== request.region_id) {
        throw new ForbiddenException("Tu ne peux approuver que les demandes de ta propre municipalité.");
      }
    }

    await this.applyApproval(requestId, request.user_id, request.region_id, request.requested_role as 'municipal_staff' | 'municipal_admin', reviewerId);
    return { approved: true };
  }

  async rejectAccessRequest(requestId: string, reviewerId: string, reviewerIsSiteAdmin: boolean) {
    if (!reviewerIsSiteAdmin) {
      const request = await this.db.selectFrom('municipality_access_requests').select('region_id').where('id', '=', requestId).executeTakeFirst();
      const reviewer = await this.db.selectFrom('users').select('region_id').where('id', '=', reviewerId).executeTakeFirst();
      if (!request || reviewer?.region_id !== request.region_id) {
        throw new ForbiddenException("Tu ne peux refuser que les demandes de ta propre municipalité.");
      }
    }
    await this.db
      .updateTable('municipality_access_requests')
      .set({ status: 'rejected', reviewed_at: new Date() as any, reviewed_by: reviewerId })
      .where('id', '=', requestId)
      .execute();
    return { rejected: true };
  }

  /** Liste des municipalités ayant au moins un employé approuvé, avec leur
   * palier actuel — pour la gestion admin (gratuit/premium). */
  async findMunicipalitiesWithAccess() {
    return this.db
      .selectFrom('regions')
      .innerJoin('users', 'users.region_id', 'regions.id')
      .innerJoin('roles', 'roles.id', 'users.role_id')
      .leftJoin('municipality_subscriptions', 'municipality_subscriptions.region_id', 'regions.id')
      .select([
        'regions.id as regionId', 'regions.name_fr as regionName',
        ({ fn }) => fn.count<number>('users.id').as('staffCount'),
        'municipality_subscriptions.tier',
      ])
      .where('roles.name', 'in', ['municipal_staff', 'municipal_admin'])
      .groupBy(['regions.id', 'regions.name_fr', 'municipality_subscriptions.tier'])
      .orderBy('regions.name_fr', 'asc')
      .execute();
  }

  async setSubscriptionTier(regionId: string, tier: 'free' | 'premium', updatedBy: string) {
    await this.db
      .insertInto('municipality_subscriptions')
      .values({ region_id: regionId, tier, updated_by: updatedBy })
      .onConflict((oc) => oc.column('region_id').doUpdateSet({ tier, updated_at: new Date() as any, updated_by: updatedBy }))
      .execute();
    return { updated: true };
  }

  // ---------- Portée par municipalité (aide interne) ----------

  /** Renvoie le region_id et le palier d'abonnement de l'usager courant —
   * lève une erreur claire si son compte n'est pas (ou plus) rattaché au
   * portail municipal. Utilisé au début de chaque méthode ci-dessous pour
   * garantir qu'un employé ne voit JAMAIS les données d'une autre
   * municipalité que la sienne. */
  private async getScopeOrThrow(userId: string): Promise<{ regionId: string; tier: 'free' | 'premium' }> {
    const user = await this.db.selectFrom('users').select('region_id').where('id', '=', userId).executeTakeFirst();
    if (!user?.region_id) throw new ForbiddenException("Ton compte n'est rattaché à aucune municipalité.");
    const sub = await this.db.selectFrom('municipality_subscriptions').select('tier').where('region_id', '=', user.region_id).executeTakeFirst();
    return { regionId: user.region_id, tier: sub?.tier ?? 'free' };
  }

  /** Vérifie qu'un employé a bien la permission demandée avant de
   * lui laisser exécuter une action du portail — l'application RÉELLE
   * (pas seulement l'interface de configuration) des permissions
   * configurables par rang construites plus tôt. Un municipal_admin
   * passe toujours (accès complet garanti, peu importe la
   * configuration des rangs). Vérifié CÔTÉ SERVEUR sur chaque route
   * concernée, pas seulement en cachant des boutons côté client — une
   * simple dissimulation visuelle ne serait pas une vraie sécurité. */
  private async checkPermission(userId: string, permissionKey: string): Promise<{ regionId: string; tier: 'free' | 'premium' }> {
    const scope = await this.getScopeOrThrow(userId);
    const user = await this.db
      .selectFrom('users')
      .innerJoin('roles', 'roles.id', 'users.role_id')
      .select(['roles.name as roleName', 'users.municipal_rank as rank'])
      .where('users.id', '=', userId)
      .executeTakeFirst();

    if (user?.roleName === 'municipal_admin') return scope; // toujours accès complet

    if (user?.roleName === 'municipal_staff' && user.rank) {
      const perms = await this.getRankPermissionsForRegion(scope.regionId);
      const rankPerms = perms.find((p: any) => p.rank === user.rank);
      if (rankPerms && (rankPerms as any)[permissionKey]) return scope;
    }

    throw new ForbiddenException("Ton rang n'a pas accès à cette section — un gestionnaire principal peut ajuster les permissions dans Équipe.");
  }

  /** Permissions effectives de l'usager courant — pour que le frontend
   * sache quoi afficher/cacher dans la navigation latérale. Un
   * municipal_admin a toujours tout à true. */
  async getMyEffectivePermissions(userId: string) {
    const { regionId } = await this.getScopeOrThrow(userId);
    const user = await this.db
      .selectFrom('users')
      .innerJoin('roles', 'roles.id', 'users.role_id')
      .select(['roles.name as roleName', 'users.municipal_rank as rank'])
      .where('users.id', '=', userId)
      .executeTakeFirst();

    const ALL_TRUE = {
      can_view_dashboard: true, can_view_reports: true, can_edit_reports: true,
      can_view_stats: true, can_view_comparatives: true, can_manage_team: true, can_manage_settings: true,
    };
    if (user?.roleName === 'municipal_admin') return ALL_TRUE;

    if (user?.roleName === 'municipal_staff' && user.rank) {
      const perms = await this.getRankPermissionsForRegion(regionId);
      const rankPerms = perms.find((p: any) => p.rank === user.rank);
      if (rankPerms) return rankPerms;
    }

    return { can_view_dashboard: true, can_view_reports: false, can_edit_reports: false, can_view_stats: false, can_view_comparatives: false, can_manage_team: false, can_manage_settings: false };
  }

  /** Téléverse le logo de SA PROPRE municipalité — municipal_admin
   * seulement, scopé automatiquement via getScopeOrThrow. */
  async uploadMyRegionLogo(userId: string, file: Express.Multer.File) {
    const { regionId } = await this.getScopeOrThrow(userId);
    return this.uploadLogoForRegion(regionId, file);
  }

  /** Téléverse le logo de N'IMPORTE QUELLE municipalité — admin du site
   * seulement, regionId fourni explicitement par le contrôleur. */
  async uploadLogoForRegion(regionId: string, file: Express.Multer.File) {
    const { url } = await this.uploads.uploadGenericFile('municipality-logos', file);
    await this.db.updateTable('regions').set({ logo_url: url }).where('id', '=', regionId).execute();
    return { url };
  }

  async findPendingAccessRequestsForReviewer(userId: string) {
    const { regionId } = await this.getScopeOrThrow(userId);
    return this.findPendingAccessRequests(regionId);
  }

  /** Liste des employés municipaux (municipal_staff + municipal_admin)
   * de la même municipalité que l'appelant — pour l'onglet "Équipe" du
   * portail. */
  async findMyRegionTeam(userId: string) {
    const { regionId } = await this.checkPermission(userId, 'can_manage_team');
    return this.db
      .selectFrom('users')
      .innerJoin('roles', 'roles.id', 'users.role_id')
      .select(['users.id', 'users.email', 'users.first_name as firstName', 'users.last_name as lastName', 'roles.name as roleName', 'users.municipal_rank as rank', 'users.created_at as memberSince'])
      .where('users.region_id', '=', regionId)
      .where('roles.name', 'in', ['municipal_staff', 'municipal_admin'])
      .orderBy('roles.name', 'desc') // municipal_admin avant municipal_staff (ordre alphabétique inversé, coïncidence pratique)
      .orderBy('users.created_at', 'asc')
      .execute();
  }

  /** Retire un employé de l'équipe municipale — ramène son compte au
   * rôle 'user' de base plutôt que de le supprimer, il garde son accès
   * normal au client mon511 public. Seul un municipal_admin peut
   * retirer quelqu'un, jamais un municipal_staff, et jamais soi-même
   * (éviter qu'une équipe se retrouve accidentellement sans aucun
   * admin). */
  async removeMyRegionTeamMember(userId: string, targetUserId: string) {
    const { regionId } = await this.getScopeOrThrow(userId);
    if (targetUserId === userId) {
      throw new ForbiddenException('Impossible de te retirer toi-même de ton équipe — demande à un autre gestionnaire municipal de le faire.');
    }

    const target = await this.db
      .selectFrom('users')
      .innerJoin('roles', 'roles.id', 'users.role_id')
      .select(['users.id', 'users.region_id', 'roles.name as roleName'])
      .where('users.id', '=', targetUserId)
      .executeTakeFirst();
    if (!target || target.region_id !== regionId || !['municipal_staff', 'municipal_admin'].includes(target.roleName)) {
      throw new NotFoundException("Ce compte ne fait pas partie de ton équipe.");
    }

    const userRole = await this.db.selectFrom('roles').select('id').where('name', '=', 'user').executeTakeFirstOrThrow();
    await this.db.updateTable('users').set({ role_id: userRole.id, region_id: null }).where('id', '=', targetUserId).execute();
    return { removed: true };
  }

  /** Change le rang d'un membre déjà dans l'équipe — seul un
   * municipal_admin peut le faire, jamais sur lui-même (il n'a pas de
   * rang, c'est le gestionnaire principal), jamais sur un autre
   * municipal_admin. */
  async updateTeamMemberRank(userId: string, targetUserId: string, rank: string) {
    const { regionId } = await this.getScopeOrThrow(userId);
    if (!(MunicipalPortalService.RANKS as readonly string[]).includes(rank)) {
      throw new BadRequestException('Rang invalide.');
    }
    const target = await this.db
      .selectFrom('users')
      .innerJoin('roles', 'roles.id', 'users.role_id')
      .select(['users.id', 'users.region_id', 'roles.name as roleName'])
      .where('users.id', '=', targetUserId)
      .executeTakeFirst();
    if (!target || target.region_id !== regionId || target.roleName !== 'municipal_staff') {
      throw new NotFoundException("Ce compte ne fait pas partie de ton équipe en tant qu'employé.");
    }
    await this.db.updateTable('users').set({ municipal_rank: rank as any }).where('id', '=', targetUserId).execute();
    return { updated: true };
  }

  static readonly RANKS = ['director', 'foreman', 'employee'] as const;

  /** Permissions des trois rangs pour une municipalité — crée les
   * lignes par défaut à la demande si elles n'existent pas encore
   * (première consultation), jamais au moment de la migration (pas
   * besoin de pré-remplir pour les milliers de municipalités qui
   * n'ont pas encore d'équipe). */
  async getMyRegionRankPermissions(userId: string) {
    const { regionId } = await this.getScopeOrThrow(userId);
    return this.getRankPermissionsForRegion(regionId);
  }

  async getRankPermissionsForRegion(regionId: string) {
    const existing = await this.db
      .selectFrom('municipal_rank_permissions')
      .selectAll()
      .where('region_id', '=', regionId)
      .execute();

    const byRank = new Map(existing.map((r) => [r.rank, r]));
    const DEFAULTS: Record<string, Partial<Record<string, boolean>>> = {
      director: { can_view_dashboard: true, can_view_reports: true, can_edit_reports: true, can_view_stats: true, can_view_comparatives: true, can_manage_team: true, can_manage_settings: true },
      foreman: { can_view_dashboard: true, can_view_reports: true, can_edit_reports: true, can_view_stats: true, can_view_comparatives: true, can_manage_team: false, can_manage_settings: false },
      employee: { can_view_dashboard: true, can_view_reports: true, can_edit_reports: false, can_view_stats: false, can_view_comparatives: false, can_manage_team: false, can_manage_settings: false },
    };

    return MunicipalPortalService.RANKS.map((rank) => byRank.get(rank) ?? { region_id: regionId, rank, ...DEFAULTS[rank] });
  }

  /** Seul un municipal_admin peut modifier les permissions — jamais un
   * municipal_staff, peu importe son rang (même un "directeur" ne peut
   * pas s'octroyer plus de droits lui-même). */
  async updateMyRegionRankPermissions(userId: string, rank: string, permissions: Record<string, boolean>) {
    const { regionId } = await this.getScopeOrThrow(userId);
    if (!(MunicipalPortalService.RANKS as readonly string[]).includes(rank)) {
      throw new BadRequestException('Rang invalide.');
    }

    const ALLOWED_KEYS = ['can_view_dashboard', 'can_view_reports', 'can_edit_reports', 'can_view_stats', 'can_view_comparatives', 'can_manage_team', 'can_manage_settings'];
    const values: Record<string, boolean> = {};
    for (const key of ALLOWED_KEYS) {
      if (typeof permissions[key] === 'boolean') values[key] = permissions[key];
    }

    await this.db
      .insertInto('municipal_rank_permissions')
      .values({ region_id: regionId, rank: rank as any, ...values })
      .onConflict((oc) => oc.columns(['region_id', 'rank']).doUpdateSet(values))
      .execute();

    return this.getRankPermissionsForRegion(regionId);
  }

  /** Génère un lien d'invitation — jeton aléatoire cryptographique
   * (randomBytes, même patron déjà utilisé ailleurs dans ce projet
   * pour les jetons de vérification), usage unique, expire dans 48h.
   * Seul un municipal_admin peut générer un lien — jamais un
   * municipal_staff, même un "directeur". */
  async createMyRegionInvite(userId: string, rank: string, email?: string) {
    const { regionId } = await this.getScopeOrThrow(userId);
    if (!(MunicipalPortalService.RANKS as readonly string[]).includes(rank)) {
      throw new BadRequestException('Rang invalide.');
    }

    const token = randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000); // 48h
    const cleanEmail = email?.trim().toLowerCase() || null;

    await this.db
      .insertInto('municipal_invites')
      .values({
        region_id: regionId, rank: rank as any, token, email: cleanEmail, created_by: userId, expires_at: expiresAt as any,
        last_sent_at: cleanEmail ? (new Date() as any) : null,
      })
      .execute();

    if (cleanEmail) {
      await this.sendInviteEmail(cleanEmail, token, regionId, rank);
    }

    return { token, expiresAt, email: cleanEmail };
  }

  /** Envoi effectif du courriel d'invitation — factorisé pour être
   * réutilisé par la génération initiale ET le renvoi. */
  private async sendInviteEmail(email: string, token: string, regionId: string, rank: string) {
    const region = await this.db.selectFrom('regions').select('name_fr').where('id', '=', regionId).executeTakeFirst();
    const RANK_LABELS: Record<string, string> = { director: 'Directeur', foreman: 'Contremaître', employee: 'Employé' };
    const frontendUrl = process.env.FRONTEND_URL ?? 'https://mon511.ca';
    const inviteUrl = `${frontendUrl}/?municipalInvite=${token}`;
    await this.email
      .send(
        email,
        `Invitation à rejoindre l'équipe municipale de ${region?.name_fr ?? 'ta municipalité'} — mon511.ca`,
        `Tu as été invité(e) à rejoindre l'équipe municipale de ${region?.name_fr ?? ''} en tant que ${RANK_LABELS[rank] ?? rank}. Si tu n'as pas encore de compte mon511, tu peux en créer un avec cette même adresse courriel en cliquant le lien — ton compte sera automatiquement rattaché à l'équipe. Ce lien expire dans 48 heures et ne peut être utilisé qu'une seule fois.`,
        { ctaLabel: "Rejoindre l'équipe", ctaUrl: inviteUrl },
      )
      .catch(() => {});
  }

  /** Renvoie le courriel d'une invitation déjà existante — protection
   * anti-spam : au moins 2 minutes entre deux envois de la MÊME
   * invitation, seuil de départ raisonnable pour empêcher un clic
   * répété accidentel ou un usage abusif, ajustable si besoin. */
  async resendMyRegionInvite(userId: string, inviteId: string) {
    const { regionId } = await this.getScopeOrThrow(userId);
    const invite = await this.db.selectFrom('municipal_invites').selectAll().where('id', '=', inviteId).executeTakeFirst();
    if (!invite || invite.region_id !== regionId) throw new NotFoundException('Invitation introuvable.');
    if (invite.used_at) throw new BadRequestException('Cette invitation a déjà été utilisée.');
    if (!invite.email) throw new BadRequestException("Cette invitation n'a pas de courriel associé — copie plutôt le lien directement.");

    const COOLDOWN_MS = 2 * 60 * 1000;
    if (invite.last_sent_at) {
      const elapsed = Date.now() - new Date(invite.last_sent_at).getTime();
      if (elapsed < COOLDOWN_MS) {
        const waitSeconds = Math.ceil((COOLDOWN_MS - elapsed) / 1000);
        throw new BadRequestException(`Pour éviter le spam, attends encore ${waitSeconds} secondes avant de renvoyer ce courriel.`);
      }
    }

    await this.sendInviteEmail(invite.email, invite.token, regionId, invite.rank);
    await this.db.updateTable('municipal_invites').set({ last_sent_at: new Date() as any }).where('id', '=', inviteId).execute();
    return { sent: true };
  }

  /** Invitations en attente (ni utilisées, ni expirées) pour la
   * municipalité — pour l'affichage et l'annulation dans la section
   * Équipe. */
  async findMyRegionPendingInvites(userId: string) {
    const { regionId } = await this.getScopeOrThrow(userId);
    return this.db
      .selectFrom('municipal_invites')
      .select(['id', 'token', 'rank', 'email', 'expires_at as expiresAt', 'created_at as createdAt'])
      .where('region_id', '=', regionId)
      .where('used_at', 'is', null)
      .where('expires_at', '>', new Date() as any)
      .orderBy('created_at', 'desc')
      .execute();
  }

  /** Annule (supprime) une invitation pas encore utilisée — seul un
   * municipal_admin, seulement pour sa propre municipalité. */
  async cancelMyRegionInvite(userId: string, inviteId: string) {
    const { regionId } = await this.getScopeOrThrow(userId);
    const invite = await this.db.selectFrom('municipal_invites').select(['id', 'region_id', 'used_at']).where('id', '=', inviteId).executeTakeFirst();
    if (!invite || invite.region_id !== regionId) throw new NotFoundException('Invitation introuvable.');
    if (invite.used_at) throw new BadRequestException('Cette invitation a déjà été utilisée — impossible de l\'annuler.');
    await this.db.deleteFrom('municipal_invites').where('id', '=', inviteId).execute();
    return { cancelled: true };
  }

  /** Aperçu public d'une invitation (SANS la consommer) — pour afficher
   * "tu as été invité à rejoindre X" avant même que l'usager soit
   * connecté, et pré-remplir son adresse courriel au moment de
   * s'inscrire. */
  async previewInvite(token: string) {
    const invite = await this.db.selectFrom('municipal_invites').selectAll().where('token', '=', token).executeTakeFirst();
    if (!invite || invite.used_at || new Date(invite.expires_at) < new Date()) {
      return { valid: false };
    }
    const region = await this.db.selectFrom('regions').select('name_fr').where('id', '=', invite.region_id).executeTakeFirst();
    return { valid: true, regionName: region?.name_fr, rank: invite.rank, email: invite.email };
  }

  /** Utilise un lien d'invitation — l'usager DOIT déjà être connecté à
   * son compte mon511 (le lien ne crée pas de nouveau compte, il
   * rattache le compte courant à la municipalité). Vérifie : jeton
   * existe, pas déjà utilisé, pas expiré — sinon message clair sans
   * révéler pourquoi précisément (usage unique ou expiré donnent le
   * même type d'erreur, pour ne pas faciliter le sondage de jetons
   * valides). */
  async redeemInvite(userId: string, token: string) {
    const invite = await this.db.selectFrom('municipal_invites').selectAll().where('token', '=', token).executeTakeFirst();
    if (!invite || invite.used_at || new Date(invite.expires_at) < new Date()) {
      throw new BadRequestException("Ce lien d'invitation est invalide ou a expiré.");
    }

    // Même protection déjà en place pour l'approbation manuelle — ne
    // jamais écraser silencieusement un compte déjà admin/super_admin
    // du site NI un compte déjà membre d'une équipe municipale (même
    // rang inférieur) — l'usager a rapporté exactement ce cas : un
    // "directeur" ayant cliqué un lien d'invitation "employé" se
    // retrouvait rétrogradé sans avertissement.
    const currentRole = await this.db
      .selectFrom('users')
      .innerJoin('roles', 'roles.id', 'users.role_id')
      .select('roles.name as roleName')
      .where('users.id', '=', userId)
      .executeTakeFirst();
    if (currentRole && (currentRole.roleName === 'admin' || currentRole.roleName === 'super_admin')) {
      throw new ForbiddenException("Ce compte est déjà administrateur du site — utilise un autre compte pour rejoindre une équipe municipale.");
    }
    if (currentRole && (currentRole.roleName === 'municipal_admin' || currentRole.roleName === 'municipal_staff')) {
      throw new ForbiddenException("Ce compte fait déjà partie d'une équipe municipale — utilise un autre compte, ou retire d'abord ce compte de son équipe actuelle (section Équipe) avant d'utiliser ce lien.");
    }

    // Si l'invitation cible une adresse précise (envoyée par courriel),
    // seul un compte avec exactement cette adresse peut l'utiliser —
    // empêche qu'un lien destiné à une personne précise soit intercepté
    // et utilisé par quelqu'un d'autre.
    if (invite.email) {
      const currentUser = await this.db.selectFrom('users').select('email').where('id', '=', userId).executeTakeFirst();
      if (!currentUser || currentUser.email.toLowerCase() !== invite.email.toLowerCase()) {
        throw new ForbiddenException(`Cette invitation est destinée à ${invite.email} — connecte-toi avec cette adresse précise pour l'utiliser.`);
      }
    }

    const staffRole = await this.db.selectFrom('roles').select('id').where('name', '=', 'municipal_staff').executeTakeFirstOrThrow();

    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('users')
        .set({ role_id: staffRole.id, region_id: invite.region_id, municipal_rank: invite.rank })
        .where('id', '=', userId)
        .execute();
      await trx
        .updateTable('municipal_invites')
        .set({ used_at: new Date() as any, used_by: userId })
        .where('id', '=', invite.id)
        .execute();
    });

    const region = await this.db.selectFrom('regions').select('name_fr').where('id', '=', invite.region_id).executeTakeFirst();

    // Confirmation à l'inviteur — demandé explicitement, pour qu'il
    // sache que l'invitation a bien été acceptée sans avoir à revenir
    // vérifier la liste des invitations en attente.
    const [inviter, newMember] = await Promise.all([
      this.db.selectFrom('users').select('email').where('id', '=', invite.created_by).executeTakeFirst(),
      this.db.selectFrom('users').select(['first_name', 'last_name', 'email']).where('id', '=', userId).executeTakeFirst(),
    ]);
    if (inviter) {
      const RANK_LABELS: Record<string, string> = { director: 'Directeur', foreman: 'Contremaître', employee: 'Employé' };
      const memberName = newMember?.first_name || newMember?.last_name
        ? `${newMember.first_name ?? ''} ${newMember.last_name ?? ''}`.trim()
        : (newMember?.email ?? 'Un nouveau membre');
      this.email
        .send(
          inviter.email,
          `${memberName} a rejoint ton équipe municipale — mon511.ca`,
          `${memberName} (${newMember?.email ?? ''}) vient d'accepter ton invitation et fait maintenant partie de l'équipe de ${region?.name_fr ?? 'ta municipalité'} en tant que ${RANK_LABELS[invite.rank] ?? invite.rank}.`,
        )
        .catch(() => {});
    }

    // Émet un NOUVEAU jeton avec le rôle à jour — sans ça, l'usager
    // reste bloqué avec son ancien jeton (encore 'user', signé avant la
    // rédemption) jusqu'à sa prochaine connexion manuelle. Le rôle dans
    // le jeton JWT est figé au moment de sa signature, jamais revérifié
    // en base de données à chaque requête (voir RolesGuard) — sans ce
    // nouveau jeton, toutes les routes du portail retournaient 403
    // malgré le compte correctement mis à jour en base, exactement
    // rapporté par l'usager.
    const currentUser = await this.db.selectFrom('users').select('email').where('id', '=', userId).executeTakeFirstOrThrow();
    const accessToken = this.jwt.sign({ sub: userId, email: currentUser.email, role: 'municipal_staff' });

    return { regionName: region?.name_fr, rank: invite.rank, accessToken };
  }

  /** File de modération des signalements — SEULEMENT ceux de la propre
   * municipalité de l'appelant, contrairement à la file générale des
   * modérateurs du site qui voit tout. */
  // ---------- Statistiques du rapport périodique ----------

  static readonly REPORT_STAT_KEYS = [
    'active_by_type', 'resolved_period', 'new_period', 'removed_period',
    'ranking', 'resolution_performance', 'problematic_zones', 'most_confirmed',
  ] as const;

  /** Calcule toutes les statistiques disponibles pour une municipalité,
   * sur la période donnée — utilisé à la fois par le courriel
   * périodique et par l'affichage dans le portail municipal, pour
   * garantir que les deux montrent exactement les mêmes chiffres.
   * Le filtrage par statistiques activées (enabled_stats) se fait
   * PAR L'APPELANT, pas ici — cette méthode calcule toujours tout,
   * plus simple et pas assez coûteux pour justifier un calcul
   * conditionnel. */
  /** Comparatifs normalisés — signalements actifs par 1000 habitants,
   * PAS un classement brut par compte (voir computeReportStats →
   * ranking, qui pénalise injustement les grandes villes ayant
   * naturellement plus de signalements que les petits villages).
   * Population tirée de municipality_integrations, remplie
   * manuellement par l'admin du site — pas garantie pour toutes les
   * municipalités, celles sans population connue sont exclues du
   * classement (mais toujours comptées si l'appelant lui-même n'a pas
   * de population connue, avec un message clair l'expliquant). */
  async computeComparatives(regionId: string) {
    const rows = await this.db
      .selectFrom('regions')
      .leftJoin('municipality_integrations', 'municipality_integrations.region_id', 'regions.id')
      .select([
        'regions.id as regionId', 'regions.name_fr as regionName', 'municipality_integrations.population as population',
        sql<number>`(SELECT count(*) FROM reports WHERE reports.region_id = regions.id AND reports.status IN ('published_unresolved', 'published_resolved'))`.as('reportCount'),
      ])
      .where('regions.type', '=', 'municipality')
      .execute();

    const withPopulation = rows
      .filter((r) => r.population && r.population > 0)
      .map((r) => ({
        regionId: r.regionId,
        regionName: r.regionName,
        population: Number(r.population),
        reportCount: Number(r.reportCount),
        ratePer1000: Math.round((Number(r.reportCount) / Number(r.population)) * 1000 * 100) / 100,
      }))
      .sort((a, b) => a.ratePer1000 - b.ratePer1000); // meilleur (moins de signalements/habitant) en premier

    const myEntry = withPopulation.find((r) => r.regionId === regionId);
    const myRank = myEntry ? withPopulation.indexOf(myEntry) + 1 : null;

    return {
      hasPopulation: !!myEntry,
      myRank,
      totalRanked: withPopulation.length,
      myEntry: myEntry ?? null,
      best10: withPopulation.slice(0, 10),
      worst10: [...withPopulation].reverse().slice(0, 10),
    };
  }

  async computeReportStats(regionId: string, periodStart: Date, periodEnd: Date) {
    const region = await this.db.selectFrom('regions').select(['id', 'name_fr as nameFr']).where('id', '=', regionId).executeTakeFirst();
    if (!region) throw new NotFoundException('Municipalité introuvable.');

    const [activeByType, resolvedCount, newCount, removedCount, ranking, resolutionPerf, problematicZones, mostConfirmed] = await Promise.all([
      // Signalements actifs, par type
      this.db
        .selectFrom('reports')
        .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
        .select(['problem_types.name_fr as typeName', 'problem_types.icon', sql<number>`count(*)`.as('count')])
        .where('reports.region_id', '=', regionId)
        .where('reports.status', '=', 'published_unresolved')
        .groupBy(['problem_types.name_fr', 'problem_types.icon'])
        .orderBy('count', 'desc')
        .execute(),

      // Résolus durant la période
      this.db
        .selectFrom('reports')
        .select(sql<number>`count(*)`.as('count'))
        .where('region_id', '=', regionId)
        .where('status', '=', 'published_resolved')
        .where('resolved_at', '>=', periodStart as any)
        .where('resolved_at', '<=', periodEnd as any)
        .executeTakeFirst(),

      // Nouveaux durant la période
      this.db
        .selectFrom('reports')
        .select(sql<number>`count(*)`.as('count'))
        .where('region_id', '=', regionId)
        .where('created_at', '>=', periodStart as any)
        .where('created_at', '<=', periodEnd as any)
        .executeTakeFirst(),

      // Retirés (rejetés) durant la période — pas de colonne dédiée
      // "rejected_at", updated_at est une approximation raisonnable
      // (un signalement rejeté n'est normalement plus modifié après).
      this.db
        .selectFrom('reports')
        .select(sql<number>`count(*)`.as('count'))
        .where('region_id', '=', regionId)
        .where('status', '=', 'rejected')
        .where('updated_at', '>=', periodStart as any)
        .where('updated_at', '<=', periodEnd as any)
        .executeTakeFirst(),

      // Classement TOP 100 — TOUTES les municipalités du Québec, même
      // celles sans compte mon511 (comparaison basée uniquement sur le
      // compte de signalements réels, pas sur l'existence d'un
      // gestionnaire). Plus de signalements actifs = pire rang.
      this.db
        .selectFrom('reports')
        .innerJoin('regions', 'regions.id', 'reports.region_id')
        .select(['regions.id as regionId', 'regions.name_fr as regionName', sql<number>`count(*)`.as('count')])
        .where('regions.type', '=', 'municipality')
        .where('reports.status', 'in', ['published_unresolved', 'published_resolved'])
        .groupBy(['regions.id', 'regions.name_fr'])
        .orderBy('count', 'desc')
        .limit(100)
        .execute(),

      // Taux de résolution + temps moyen de résolution
      this.db
        .selectFrom('reports')
        .select([
          sql<number>`count(*) filter (where status in ('published_unresolved', 'published_resolved'))`.as('totalPublished'),
          sql<number>`count(*) filter (where status = 'published_resolved')`.as('resolvedCount'),
          sql<number>`avg(extract(epoch from (resolved_at - created_at))) filter (where status = 'published_resolved' and resolved_at is not null)`.as('avgResolutionSeconds'),
        ])
        .where('region_id', '=', regionId)
        .executeTakeFirst(),

      // Zones routières les plus problématiques — REGROUPEMENT GÉOGRAPHIQUE
      // réel (PostGIS ST_ClusterDBSCAN), pas seulement le texte de
      // l'adresse. Le nom de rue seul (numéro civique retiré) sert de
      // partition — le regroupement par distance ne se fait donc jamais
      // entre deux rues différentes — puis les signalements à moins de
      // 250 mètres les uns des autres sur cette même rue sont regroupés
      // en une seule « zone ». STANDARD ÉTABLI : 150 mètres (un pâté de
      // maisons urbain) s'est avéré trop serré en pratique pour les
      // routes rurales (ex. « Chemin Craig ») où les numéros civiques
      // sont naturellement plus espacés — mesures réelles jusqu'à ~190m
      // entre deux adresses clairement dans le même secteur. 250 mètres
      // laisse une marge réaliste sans fusionner des extrémités
      // éloignées d'une longue route. minpoints=2 exclut les
      // signalements isolés (pas vraiment une « zone » à eux seuls) —
      // voir WHERE cluster_id IS NOT NULL plus bas.
      sql<{ streetName: string; minCivic: number | null; maxCivic: number | null; count: number; centerLat: number; centerLng: number }>`
        SELECT street_name AS "streetName", min(civic_number) AS "minCivic", max(civic_number) AS "maxCivic",
               count(*) AS count, avg(ST_Y(location::geometry)) AS "centerLat", avg(ST_X(location::geometry)) AS "centerLng"
        FROM (
          SELECT
            regexp_replace(split_part(address_text, ',', 1), '^\s*\d+[A-Za-z]?\s*', '') AS street_name,
            (substring(split_part(address_text, ',', 1) FROM '^\s*(\d+)'))::int AS civic_number,
            location,
            -- ST_Transform vers EPSG:32198 (NAD83 / Québec Lambert, en
            -- MÈTRES) est essentiel ici — location est en SRID 4326
            -- (degrés). Sans cette transformation, eps := 250 serait
            -- interprété comme 250 DEGRÉS (une distance absurde, plus
            -- grande que tout le Québec), pas 250 mètres.
            ST_ClusterDBSCAN(ST_Transform(location, 32198), eps := 250, minpoints := 2) OVER (
              PARTITION BY regexp_replace(split_part(address_text, ',', 1), '^\s*\d+[A-Za-z]?\s*', '')
            ) AS cluster_id
          FROM reports
          WHERE region_id = ${regionId}
            AND status IN ('published_unresolved', 'published_resolved')
            AND address_text IS NOT NULL
        ) clustered
        WHERE cluster_id IS NOT NULL
        GROUP BY street_name, cluster_id
        ORDER BY count DESC
        LIMIT 15
      `.execute(this.db).then((r) => r.rows),

      // Signalements avec le plus de confirmations "Présent"
      this.db
        .selectFrom('reports')
        .innerJoin('report_confirmations', 'report_confirmations.report_id', 'reports.id')
        .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
        .select([
          'reports.id', 'reports.address_text as addressText', 'problem_types.name_fr as typeName', 'problem_types.icon',
          sql<number>`count(report_confirmations.id)`.as('confirmationsCount'),
        ])
        .where('reports.region_id', '=', regionId)
        .where('reports.status', 'in', ['published_unresolved', 'published_resolved'])
        .groupBy(['reports.id', 'reports.address_text', 'problem_types.name_fr', 'problem_types.icon'])
        .orderBy('confirmationsCount', 'desc')
        .limit(10)
        .execute(),
    ]);

    const myRank = ranking.findIndex((r) => r.regionId === regionId);

    return {
      regionId: region.id,
      regionName: region.nameFr,
      periodStart,
      periodEnd,
      activeByType: activeByType.map((r) => ({ typeName: r.typeName, icon: r.icon, count: Number(r.count) })),
      resolvedPeriod: Number(resolvedCount?.count ?? 0),
      newPeriod: Number(newCount?.count ?? 0),
      removedPeriod: Number(removedCount?.count ?? 0),
      ranking: {
        top100: ranking.map((r, i) => ({ rank: i + 1, regionId: r.regionId, regionName: r.regionName, count: Number(r.count) })),
        myRank: myRank >= 0 ? myRank + 1 : null,
        totalRanked: ranking.length,
      },
      resolutionPerformance: {
        rate: resolutionPerf && Number(resolutionPerf.totalPublished) > 0
          ? Math.round((Number(resolutionPerf.resolvedCount) / Number(resolutionPerf.totalPublished)) * 100)
          : null,
        avgResolutionDays: resolutionPerf?.avgResolutionSeconds
          ? Math.round((Number(resolutionPerf.avgResolutionSeconds) / 86400) * 10) / 10
          : null,
      },
      problematicZones: problematicZones.map((z) => ({
        streetName: z.streetName?.trim() || '—',
        // Plage réelle des numéros civiques regroupés dans cette zone —
        // un seul numéro si tous les signalements du groupe partagent le
        // même (rare mais possible), sinon min-max.
        civicRange: z.minCivic === z.maxCivic ? String(z.minCivic ?? '') : `${z.minCivic}-${z.maxCivic}`,
        count: Number(z.count),
        centerLat: Number(z.centerLat),
        centerLng: Number(z.centerLng),
      })),
      mostConfirmed: mostConfirmed.map((r) => ({
        id: r.id, addressText: r.addressText, typeName: r.typeName, icon: r.icon, confirmationsCount: Number(r.confirmationsCount),
      })),
    };
  }

  async getMyRegionReportSettings(userId: string) {
    const { regionId } = await this.checkPermission(userId, 'can_manage_settings');
    return this.getReportSettingsForRegion(regionId);
  }

  async computeMyRegionReportStats(userId: string, periodStart: Date, periodEnd: Date) {
    const { regionId } = await this.checkPermission(userId, 'can_view_stats');
    return this.computeReportStats(regionId, periodStart, periodEnd);
  }

  async computeMyRegionComparatives(userId: string) {
    const { regionId } = await this.checkPermission(userId, 'can_view_comparatives');
    return this.computeComparatives(regionId);
  }

  async getReportSettingsForRegion(regionId: string) {
    const existing = await this.db.selectFrom('municipality_report_settings').selectAll().where('region_id', '=', regionId).executeTakeFirst();
    if (existing) return existing;
    // Pas encore de ligne pour cette municipalité — valeurs par défaut,
    // sans créer la ligne tant que rien n'a été modifié explicitement.
    // Désactivé par défaut — une municipalité doit choisir explicitement
    // de recevoir le rapport.
    return {
      region_id: regionId,
      enabled: false,
      frequency: 'monthly' as const,
      enabled_stats: [...MunicipalPortalService.REPORT_STAT_KEYS],
      last_report_sent_at: null,
    };
  }

  async updateMyRegionReportSettings(userId: string, enabled: boolean, frequency: 'weekly' | 'monthly', enabledStats: string[]) {
    const { regionId } = await this.checkPermission(userId, 'can_manage_settings');
    return this.updateReportSettingsForRegion(regionId, enabled, frequency, enabledStats);
  }

  async updateReportSettingsForRegion(regionId: string, enabled: boolean, frequency: 'weekly' | 'monthly', enabledStats: string[]) {
    const validKeys = enabledStats.filter((k) => (MunicipalPortalService.REPORT_STAT_KEYS as readonly string[]).includes(k));
    await this.db
      .insertInto('municipality_report_settings')
      .values({ region_id: regionId, enabled, frequency, enabled_stats: JSON.stringify(validKeys) as any, updated_at: new Date() as any })
      .onConflict((oc) => oc.column('region_id').doUpdateSet({ enabled, frequency, enabled_stats: JSON.stringify(validKeys) as any, updated_at: new Date() as any }))
      .execute();
    return this.getReportSettingsForRegion(regionId);
  }

  /** File de signalements du portail municipal — REGROUPÉE PAR INCIDENT
   * plutôt qu'un signalement individuel à la fois (voir
   * reports.service.ts pour la logique de regroupement à la création).
   * Les signalements sans incident_id (pas encore rattrapés, ou hors de
   * toute région connue) forment chacun leur propre groupe d'un seul
   * signalement — jamais perdus, juste pas encore fusionnés avec
   * d'autres. Le signalement le plus ancien de chaque groupe sert de
   * représentant (adresse, type, photo). */
  async findMyRegionReportsQueue(userId: string, search?: string, statusFilter?: string) {
    const { regionId } = await this.checkPermission(userId, 'can_view_reports');
    const searchPattern = search ? `%${search}%` : null;

    return sql<{
      groupKey: string; incidentId: string | null; representativeReportId: string;
      problemTypeNameFr: string; problemTypeIcon: string | null; addressText: string | null; description: string | null;
      reportCount: number; firstReportedAt: Date; lastReportedAt: Date; thumbnailUrl: string | null;
      lat: number; lng: number; status: string; internalStatus: string;
    }>`
      WITH grouped AS (
        SELECT
          COALESCE(incident_id::text, id::text) AS group_key,
          incident_id, id, problem_type_id, address_text, description, created_at, location, status,
          ROW_NUMBER() OVER (PARTITION BY COALESCE(incident_id::text, id::text) ORDER BY created_at ASC) AS rn
        FROM reports
        WHERE region_id = ${regionId}
          ${statusFilter && statusFilter !== 'all' ? sql`AND status = ${statusFilter}` : sql``}
          ${searchPattern ? sql`AND (address_text ILIKE ${searchPattern} OR description ILIKE ${searchPattern})` : sql``}
      )
      SELECT
        g.group_key AS "groupKey", g.incident_id AS "incidentId", g.id AS "representativeReportId",
        pt.name_fr AS "problemTypeNameFr", pt.icon AS "problemTypeIcon", g.address_text AS "addressText", g.description AS "description",
        g.status AS "status", COALESCE(rmt.internal_status, 'new') AS "internalStatus",
        (SELECT count(*) FROM reports r2 WHERE COALESCE(r2.incident_id::text, r2.id::text) = g.group_key AND r2.status != 'rejected') AS "reportCount",
        (SELECT min(created_at) FROM reports r2 WHERE COALESCE(r2.incident_id::text, r2.id::text) = g.group_key) AS "firstReportedAt",
        (SELECT max(created_at) FROM reports r2 WHERE COALESCE(r2.incident_id::text, r2.id::text) = g.group_key) AS "lastReportedAt",
        (SELECT url FROM report_photos WHERE report_photos.report_id = g.id ORDER BY uploaded_at ASC LIMIT 1) AS "thumbnailUrl",
        ST_Y(g.location::geometry) AS "lat", ST_X(g.location::geometry) AS "lng"
      FROM grouped g
      INNER JOIN problem_types pt ON pt.id = g.problem_type_id
      LEFT JOIN report_municipal_tracking rmt ON rmt.report_id = g.id
      WHERE g.rn = 1
      ORDER BY "lastReportedAt" DESC
    `.execute(this.db).then((r) => r.rows);
  }

  /** Détail des signalements individuels d'un incident (ou d'un groupe
   * d'un seul, si jamais rattaché) — pour voir "8 signalements" en
   * cliquant sur la carte groupée du portail. */
  async findIncidentReports(userId: string, groupKey: string) {
    const { regionId } = await this.checkPermission(userId, 'can_view_reports');
    // groupKey est soit un vrai incident_id, soit l'id d'un signalement
    // seul (jamais rattaché à un incident) — les deux cas sont couverts
    // par la même comparaison COALESCE que la requête groupée ci-dessus.
    return this.db
      .selectFrom('reports')
      .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .select([
        'reports.id', 'reports.description', 'reports.address_text', 'reports.status', 'reports.created_at',
        'problem_types.name_fr as problemTypeNameFr', 'problem_types.icon as problemTypeIcon',
        sql<string | null>`(SELECT url FROM report_photos WHERE report_photos.report_id = reports.id ORDER BY uploaded_at ASC LIMIT 1)`.as('thumbnailUrl'),
      ])
      .where('reports.region_id', '=', regionId)
      .where(sql<boolean>`COALESCE(reports.incident_id::text, reports.id::text) = ${groupKey}`)
      .orderBy('reports.created_at', 'asc')
      .execute();
  }

  /** Fiche détaillée d'un incident — toutes les photos de tous les
   * signalements rattachés, ligne du temps (soumissions individuelles +
   * dernière mise à jour de suivi — PAS un historique complet de chaque
   * changement de statut, cette table ne conserve que l'état actuel,
   * voir report_municipal_tracking), et l'état de suivi interne actuel
   * (basé sur le signalement le plus ancien du groupe, tenu synchronisé
   * avec les autres par updateIncidentTracking ci-dessous). */
  async findIncidentDetail(userId: string, groupKey: string) {
    const { regionId } = await this.checkPermission(userId, 'can_view_reports');

    const reports = await this.db
      .selectFrom('reports')
      .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .select([
        'reports.id', 'reports.description', 'reports.address_text', 'reports.status', 'reports.created_at',
        'problem_types.name_fr as problemTypeNameFr', 'problem_types.icon as problemTypeIcon',
      ])
      .where('reports.region_id', '=', regionId)
      .where(sql<boolean>`COALESCE(reports.incident_id::text, reports.id::text) = ${groupKey}`)
      .orderBy('reports.created_at', 'asc')
      .execute();

    if (reports.length === 0) throw new NotFoundException('Incident introuvable.');

    const reportIds = reports.map((r) => r.id);
    const photos = await this.db
      .selectFrom('report_photos')
      .select(['id', 'url', 'report_id as reportId', 'uploaded_at as uploadedAt'])
      .where('report_id', 'in', reportIds)
      .orderBy('uploaded_at', 'asc')
      .execute();

    const tracking = await this.db
      .selectFrom('report_municipal_tracking')
      .leftJoin('users', 'users.id', 'report_municipal_tracking.updated_by')
      .select([
        'report_municipal_tracking.internal_status as internalStatus', 'report_municipal_tracking.assigned_to as assignedTo',
        'report_municipal_tracking.internal_notes as internalNotes', 'report_municipal_tracking.updated_at as updatedAt',
        'users.first_name as updatedByFirstName',
      ])
      .where('report_municipal_tracking.report_id', '=', reports[0].id)
      .executeTakeFirst();

    // Vrai historique — chaque soumission citoyenne individuelle, plus
    // TOUS les changements de statut réellement enregistrés (voir
    // incident_status_history) — remplace l'ancienne ligne du temps
    // synthétique qui ne montrait que le dernier changement, jamais
    // l'historique complet.
    const statusEvents = await this.db
      .selectFrom('incident_status_history')
      .leftJoin('users', 'users.id', 'incident_status_history.changed_by')
      .select([
        'incident_status_history.internal_status as internalStatus', 'incident_status_history.note as note',
        'incident_status_history.visible_to_public as visibleToPublic', 'incident_status_history.changed_at as changedAt',
        'users.first_name as changedByFirstName',
      ])
      .where('incident_status_history.group_key', '=', groupKey)
      .orderBy('incident_status_history.changed_at', 'asc')
      .execute();

    const timeline = [
      ...reports.map((r) => ({ type: 'submission' as const, at: r.created_at, reportId: r.id, description: r.description })),
      ...statusEvents.map((e) => ({ type: 'status_change' as const, at: e.changedAt, status: e.internalStatus, note: e.note, visibleToPublic: e.visibleToPublic, by: e.changedByFirstName })),
    ].sort((a, b) => new Date(b.at as any).getTime() - new Date(a.at as any).getTime());

    return {
      groupKey,
      problemTypeNameFr: reports[0].problemTypeNameFr,
      problemTypeIcon: reports[0].problemTypeIcon,
      addressText: reports[0].address_text,
      description: reports[0].description,
      status: reports[0].status,
      reportCount: reports.filter((r) => r.status !== 'rejected').length,
      reports,
      photos,
      internalStatus: tracking?.internalStatus ?? 'new',
      assignedTo: tracking?.assignedTo ?? null,
      internalNotes: tracking?.internalNotes ?? null,
      timeline,
    };
  }

  /** Modifie la description/adresse du signalement représentatif d'un
   * incident — "pouvoir les modifier" demandé explicitement. */
  async updateIncidentReport(userId: string, groupKey: string, changes: { description?: string; addressText?: string }) {
    const { regionId } = await this.checkPermission(userId, 'can_edit_reports');
    const representative = await this.db
      .selectFrom('reports')
      .select('id')
      .where('region_id', '=', regionId)
      .where(sql<boolean>`COALESCE(incident_id::text, id::text) = ${groupKey}`)
      .orderBy('created_at', 'asc')
      .limit(1)
      .executeTakeFirst();
    if (!representative) throw new NotFoundException('Incident introuvable.');

    await this.db
      .updateTable('reports')
      .set({
        ...(changes.description !== undefined && { description: changes.description }),
        ...(changes.addressText !== undefined && { address_text: changes.addressText }),
      })
      .where('id', '=', representative.id)
      .execute();

    return { updated: true };
  }

  /** Change le statut PUBLIC d'un incident (visible par les citoyens sur
   * la carte, pas seulement le statut interne de suivi) — marque TOUS
   * les signalements du groupe à la fois, pour rester cohérent. */
  async setIncidentPublicStatus(userId: string, groupKey: string, status: 'published_unresolved' | 'published_resolved') {
    const { regionId } = await this.checkPermission(userId, 'can_edit_reports');
    const reports = await this.db
      .selectFrom('reports')
      .select('id')
      .where('region_id', '=', regionId)
      .where(sql<boolean>`COALESCE(incident_id::text, id::text) = ${groupKey}`)
      .execute();
    if (reports.length === 0) throw new NotFoundException('Incident introuvable.');

    await this.db
      .updateTable('reports')
      .set({
        status,
        ...(status === 'published_resolved' && { resolved_at: new Date() as any }),
      })
      .where('id', 'in', reports.map((r) => r.id))
      .execute();

    return { updated: reports.length };
  }

  /** Applique un changement de suivi (statut/assignation/notes) à TOUS
   * les signalements d'un incident d'un coup — plutôt qu'à un seul,
   * pour que le tableau de bord (qui compte par internal_status de
   * CHAQUE signalement individuel) reste cohérent : sans ça, les
   * signalements non explicitement mis à jour resteraient comptés
   * comme "Nouveaux" indéfiniment. */
  async updateIncidentTracking(
    userId: string,
    groupKey: string,
    changes: { internalStatus?: 'new' | 'acknowledged' | 'in_progress' | 'done'; assignedTo?: string; internalNotes?: string; publicNote?: string; publicNoteVisible?: boolean },
  ) {
    const { regionId } = await this.checkPermission(userId, 'can_edit_reports');

    const reports = await this.db
      .selectFrom('reports')
      .select('id')
      .where('region_id', '=', regionId)
      .where(sql<boolean>`COALESCE(incident_id::text, id::text) = ${groupKey}`)
      .execute();
    if (reports.length === 0) throw new NotFoundException('Incident introuvable.');

    for (const r of reports) {
      await this.db
        .insertInto('report_municipal_tracking')
        .values({
          report_id: r.id,
          region_id: regionId,
          internal_status: changes.internalStatus ?? 'new',
          assigned_to: changes.assignedTo ?? null,
          internal_notes: changes.internalNotes ?? null,
          updated_by: userId,
        })
        .onConflict((oc) =>
          oc.column('report_id').doUpdateSet({
            ...(changes.internalStatus !== undefined && { internal_status: changes.internalStatus }),
            ...(changes.assignedTo !== undefined && { assigned_to: changes.assignedTo }),
            ...(changes.internalNotes !== undefined && { internal_notes: changes.internalNotes }),
            updated_at: new Date() as any,
            updated_by: userId,
          }),
        )
        .execute();
    }

    // Un vrai événement d'historique, conservé pour toujours — seulement
    // quand il y a réellement un changement de statut ou une note à
    // consigner (pas pour une simple modification d'assignation seule,
    // qui n'a pas sa place dans une ligne du temps de statut). La note
    // devient visible aux citoyens sur la fiche du signalement si
    // publicNoteVisible est vrai — c'est ce qui répond au besoin
    // "leurs statuts se verront par les utilisateurs".
    if (changes.internalStatus !== undefined || changes.publicNote) {
      await this.db
        .insertInto('incident_status_history')
        .values({
          group_key: groupKey,
          region_id: regionId,
          internal_status: changes.internalStatus ?? 'new',
          note: changes.publicNote ?? null,
          visible_to_public: changes.publicNoteVisible ?? false,
          changed_by: userId,
        })
        .execute();
    }

    return { updated: reports.length };
  }

  /** Tableau de bord du portail municipal — cartes de statut (basées sur
   * internal_status déjà existant, voir report_municipal_tracking),
   * résumé, signalements prioritaires (les plus confirmés par les
   * citoyens — pas encore de vrai champ priorité dans le schéma, cette
   * heuristique est un point de départ raisonnable) et activité
   * récente (tirée des vrais changements de suivi interne déjà
   * enregistrés, pas un nouveau journal séparé). */
  async getMyRegionDashboard(userId: string) {
    const { regionId } = await this.checkPermission(userId, 'can_view_dashboard');

    const [byStatus, resolvedTotal, lateCount, resolutionPerf, priority, activity] = await Promise.all([
      // Cartes par statut interne — 'new' par défaut si aucune ligne de
      // suivi n'existe encore pour ce signalement.
      this.db
        .selectFrom('reports')
        .leftJoin('report_municipal_tracking', 'report_municipal_tracking.report_id', 'reports.id')
        .select([sql<string>`coalesce(report_municipal_tracking.internal_status, 'new')`.as('internalStatus'), sql<number>`count(*)`.as('count')])
        .where('reports.region_id', '=', regionId)
        .where('reports.status', '=', 'published_unresolved')
        .groupBy(sql`coalesce(report_municipal_tracking.internal_status, 'new')`)
        .execute(),

      this.db
        .selectFrom('reports')
        .select(sql<number>`count(*)`.as('count'))
        .where('region_id', '=', regionId)
        .where('status', '=', 'published_resolved')
        .executeTakeFirst(),

      // En retard — non résolu depuis plus de 7 jours. Seuil de départ
      // raisonnable, ajustable plus tard si besoin.
      this.db
        .selectFrom('reports')
        .select(sql<number>`count(*)`.as('count'))
        .where('region_id', '=', regionId)
        .where('status', '=', 'published_unresolved')
        .where(sql<boolean>`created_at < now() - interval '7 days'`)
        .executeTakeFirst(),

      this.db
        .selectFrom('reports')
        .select([
          sql<number>`count(*) filter (where status = 'published_resolved')`.as('resolvedCount'),
          sql<number>`count(*) filter (where status = 'published_resolved' and resolved_at - created_at <= interval '7 days')`.as('resolvedUnder7d'),
          sql<number>`avg(extract(epoch from (resolved_at - created_at))) filter (where status = 'published_resolved' and resolved_at is not null)`.as('avgResolutionSeconds'),
        ])
        .where('region_id', '=', regionId)
        .executeTakeFirst(),

      this.db
        .selectFrom('reports')
        .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
        .select([
          'reports.id', 'reports.address_text as addressText', 'reports.created_at',
          'problem_types.name_fr as typeName', 'problem_types.icon',
          sql<number>`(SELECT count(*) FROM report_confirmations WHERE report_confirmations.report_id = reports.id)`.as('confirmationsCount'),
        ])
        .where('reports.region_id', '=', regionId)
        .where('reports.status', '=', 'published_unresolved')
        .orderBy(sql`(SELECT count(*) FROM report_confirmations WHERE report_confirmations.report_id = reports.id)`, 'desc')
        .limit(5)
        .execute(),

      this.db
        .selectFrom('report_municipal_tracking')
        .innerJoin('reports', 'reports.id', 'report_municipal_tracking.report_id')
        .leftJoin('users', 'users.id', 'report_municipal_tracking.updated_by')
        .select([
          'report_municipal_tracking.internal_status as internalStatus', 'report_municipal_tracking.updated_at as updatedAt',
          'reports.id as reportId', 'reports.address_text as addressText', 'users.first_name as updatedByFirstName',
        ])
        .where('report_municipal_tracking.region_id', '=', regionId)
        .orderBy('report_municipal_tracking.updated_at', 'desc')
        .limit(10)
        .execute(),
    ]);

    const statusMap: Record<string, number> = {};
    byStatus.forEach((s) => { statusMap[s.internalStatus] = Number(s.count); });
    const activeTotal = Object.values(statusMap).reduce((a, b) => a + b, 0);

    return {
      counts: {
        new: statusMap['new'] ?? 0,
        acknowledged: statusMap['acknowledged'] ?? 0,
        inProgress: statusMap['in_progress'] ?? 0,
        done: statusMap['done'] ?? 0,
        resolved: Number(resolvedTotal?.count ?? 0),
        late: Number(lateCount?.count ?? 0),
      },
      summary: {
        activeTotal,
        avgResolutionDays: resolutionPerf?.avgResolutionSeconds ? Math.round((Number(resolutionPerf.avgResolutionSeconds) / 86400) * 10) / 10 : null,
        resolvedUnder7dPct: resolutionPerf && Number(resolutionPerf.resolvedCount) > 0
          ? Math.round((Number(resolutionPerf.resolvedUnder7d) / Number(resolutionPerf.resolvedCount)) * 100)
          : null,
      },
      priority: priority.map((p) => ({ ...p, confirmationsCount: Number(p.confirmationsCount) })),
      activity,
    };
  }

  private async assertReportInRegion(regionId: string, reportId: string) {
    const report = await this.db.selectFrom('reports').select('region_id').where('id', '=', reportId).executeTakeFirst();
    if (!report) throw new NotFoundException('Signalement introuvable.');
    if (report.region_id !== regionId) throw new ForbiddenException("Ce signalement n'appartient pas à ta municipalité.");
  }

  async resolveReportInMyRegion(userId: string, reportId: string) {
    const { regionId } = await this.getScopeOrThrow(userId);
    await this.assertReportInRegion(regionId, reportId);
    await this.db.updateTable('reports').set({ status: 'published_resolved', resolved_at: new Date() as any, updated_at: new Date() as any }).where('id', '=', reportId).execute();
    return { resolved: true };
  }

  /** « Signaler une fausse information » — même statut rejected que la
   * modération générale du site, scopé à la propre municipalité. */
  async rejectReportInMyRegion(userId: string, reportId: string, _reason?: string) {
    const { regionId } = await this.getScopeOrThrow(userId);
    await this.assertReportInRegion(regionId, reportId);
    await this.db.updateTable('reports').set({ status: 'rejected', updated_at: new Date() as any }).where('id', '=', reportId).execute();
    return { rejected: true };
  }

  async findMyRegionPostsQueue(userId: string) {
    const { regionId } = await this.getScopeOrThrow(userId);
    return this.db
      .selectFrom('posts')
      .innerJoin('users', 'users.id', 'posts.author_id')
      .select([
        'posts.id', 'posts.category', 'posts.body', 'posts.link_url as linkUrl', 'posts.visibility', 'posts.created_at',
        'users.email as authorEmail', 'users.first_name as authorFirstName', 'users.last_name as authorLastName',
      ])
      .where('posts.region_id', '=', regionId)
      .where('posts.status', '=', 'pending_moderation')
      .orderBy('posts.created_at', 'asc')
      .execute();
  }

  private async assertPostInRegion(regionId: string, postId: string) {
    const post = await this.db.selectFrom('posts').select('region_id').where('id', '=', postId).executeTakeFirst();
    if (!post) throw new NotFoundException('Publication introuvable.');
    if (post.region_id !== regionId) throw new ForbiddenException("Cette publication n'appartient pas à ta municipalité.");
  }

  async approvePostInMyRegion(userId: string, postId: string) {
    const { regionId } = await this.getScopeOrThrow(userId);
    await this.assertPostInRegion(regionId, postId);
    await this.db.updateTable('posts').set({ status: 'published', updated_at: new Date() as any }).where('id', '=', postId).execute();
    return { approved: true };
  }

  async rejectPostInMyRegion(userId: string, postId: string, reason?: string) {
    const { regionId } = await this.getScopeOrThrow(userId);
    await this.assertPostInRegion(regionId, postId);
    await this.db.updateTable('posts').set({ status: 'rejected', rejection_reason: reason ?? null, updated_at: new Date() as any }).where('id', '=', postId).execute();
    return { rejected: true };
  }

  // ---------- Tableau de bord ----------

  async findReports(userId: string, status?: string, limit = 50, offset = 0) {
    const { regionId } = await this.getScopeOrThrow(userId);

    let query = this.db
      .selectFrom('reports')
      .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .leftJoin('report_municipal_tracking', 'report_municipal_tracking.report_id', 'reports.id')
      .select([
        'reports.id', 'reports.description', 'reports.address_text as addressText',
        'reports.status', 'reports.created_at', 'reports.resolved_at',
        'problem_types.name_fr as problemTypeNameFr', 'problem_types.icon as problemTypeIcon',
        'report_municipal_tracking.internal_status as internalStatus',
        'report_municipal_tracking.assigned_to as assignedTo',
        'report_municipal_tracking.internal_notes as internalNotes',
      ])
      .where('reports.region_id', '=', regionId)
      .where('reports.status', 'in', ['published_unresolved', 'published_resolved', 'archived']);

    if (status) query = query.where('reports.status', '=', status as any);

    return query.orderBy('reports.created_at', 'desc').limit(limit).offset(offset).execute();
  }

  async updateTracking(
    userId: string,
    reportId: string,
    changes: { internalStatus?: 'new' | 'acknowledged' | 'in_progress' | 'done'; assignedTo?: string; internalNotes?: string },
  ) {
    const { regionId } = await this.getScopeOrThrow(userId);

    const report = await this.db.selectFrom('reports').select('region_id').where('id', '=', reportId).executeTakeFirst();
    if (!report || report.region_id !== regionId) throw new ForbiddenException('Ce signalement ne concerne pas ta municipalité.');

    await this.db
      .insertInto('report_municipal_tracking')
      .values({
        report_id: reportId,
        region_id: regionId,
        internal_status: changes.internalStatus ?? 'new',
        assigned_to: changes.assignedTo ?? null,
        internal_notes: changes.internalNotes ?? null,
        updated_by: userId,
      })
      .onConflict((oc) =>
        oc.column('report_id').doUpdateSet({
          ...(changes.internalStatus !== undefined && { internal_status: changes.internalStatus }),
          ...(changes.assignedTo !== undefined && { assigned_to: changes.assignedTo }),
          ...(changes.internalNotes !== undefined && { internal_notes: changes.internalNotes }),
          updated_at: new Date() as any,
          updated_by: userId,
        }),
      )
      .execute();

    return { updated: true };
  }

  // ---------- Statistiques (gratuit — de base) ----------

  async getStats(userId: string) {
    const { regionId } = await this.getScopeOrThrow(userId);

    const [byStatus, byType, avgResolution] = await Promise.all([
      this.db
        .selectFrom('reports')
        .select(['status', ({ fn }) => fn.count<number>('id').as('count')])
        .where('region_id', '=', regionId)
        .groupBy('status')
        .execute(),
      this.db
        .selectFrom('reports')
        .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
        .select(['problem_types.name_fr as type', ({ fn }) => fn.count<number>('reports.id').as('count')])
        .where('reports.region_id', '=', regionId)
        .groupBy('problem_types.name_fr')
        .orderBy('count', 'desc')
        .execute(),
      this.db
        .selectFrom('reports')
        .select(sql<number>`AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400)`.as('avgDays'))
        .where('region_id', '=', regionId)
        .where('resolved_at', 'is not', null)
        .executeTakeFirst(),
    ]);

    return {
      byStatus,
      byType,
      avgResolutionDays: avgResolution?.avgDays ? Number(avgResolution.avgDays.toFixed(1)) : null,
    };
  }

  // ---------- Comparatifs (premium) ----------

  async getComparatives(userId: string) {
    const { regionId, tier } = await this.getScopeOrThrow(userId);
    if (tier !== 'premium') {
      throw new ForbiddenException("Les comparatifs font partie des fonctions avancées — palier premium requis pour cette municipalité.");
    }

    const mine = await this.db
      .selectFrom('municipality_integrations')
      .select('population')
      .where('region_id', '=', regionId)
      .executeTakeFirst();
    if (!mine?.population) return { comparable: false };

    // Municipalités de population comparable (± 30%), avec au moins 3
    // signalements résolus pour un temps moyen significatif.
    const lowerBound = mine.population * 0.7;
    const upperBound = mine.population * 1.3;

    const similarRegions = await this.db
      .selectFrom('municipality_integrations')
      .select('region_id')
      .where('population', '>=', lowerBound)
      .where('population', '<=', upperBound)
      .where('region_id', 'is not', null)
      .execute();
    const regionIds = similarRegions.map((r) => r.region_id).filter((id): id is string => !!id);

    if (regionIds.length < 2) return { comparable: false };

    const [myAvg, theirAvg] = await Promise.all([
      this.db
        .selectFrom('reports')
        .select(sql<number>`AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400)`.as('avgDays'))
        .where('region_id', '=', regionId)
        .where('resolved_at', 'is not', null)
        .executeTakeFirst(),
      this.db
        .selectFrom('reports')
        .select(sql<number>`AVG(EXTRACT(EPOCH FROM (resolved_at - created_at)) / 86400)`.as('avgDays'))
        .where('region_id', 'in', regionIds)
        .where('resolved_at', 'is not', null)
        .executeTakeFirst(),
    ]);

    return {
      comparable: true,
      similarMunicipalitiesCount: regionIds.length,
      myAvgResolutionDays: myAvg?.avgDays ? Number(myAvg.avgDays.toFixed(1)) : null,
      comparableAvgResolutionDays: theirAvg?.avgDays ? Number(theirAvg.avgDays.toFixed(1)) : null,
    };
  }

  // ---------- Export (premium) ----------

  async exportCsv(userId: string): Promise<string> {
    const { tier } = await this.getScopeOrThrow(userId);
    if (tier !== 'premium') {
      throw new ForbiddenException("L'export fait partie des fonctions avancées — palier premium requis pour cette municipalité.");
    }

    const reports = await this.findReports(userId, undefined, 5000, 0);
    const header = 'ID,Type,Statut,Statut interne,Assigné à,Adresse,Créé le,Résolu le\n';
    const rows = reports
      .map((r) =>
        [r.id, r.problemTypeNameFr, r.status, r.internalStatus ?? 'new', r.assignedTo ?? '', `"${(r.addressText ?? '').replace(/"/g, '""')}"`, r.created_at, r.resolved_at ?? '']
          .join(','),
      )
      .join('\n');
    return header + rows;
  }

  // ---------- Rapport périodique par courriel ----------

  /** Construit le HTML du rapport à partir des statistiques déjà
   * calculées, en ne montrant que celles activées pour cette
   * municipalité (enabledStats) — même fonction utilisée pour le vrai
   * envoi périodique et pour le test manuel, garantit que le test
   * reflète fidèlement ce qui sera vraiment envoyé. */
  private renderReportStatsHtml(stats: Awaited<ReturnType<MunicipalPortalService['computeReportStats']>>, enabledStats: string[]): string {
    const section = (title: string, content: string) =>
      `<div style="margin:20px 0;"><h3 style="font-size:15px;margin:0 0 8px;">${title}</h3>${content}</div>`;

    let html = '';

    if (enabledStats.includes('active_by_type')) {
      const rows = stats.activeByType.map((s) => `<tr><td style="padding:4px 8px;">${s.icon ?? '📍'} ${s.typeName}</td><td style="padding:4px 8px;text-align:right;">${s.count}</td></tr>`).join('');
      html += section('Signalements actifs par type', `<table style="width:100%;border-collapse:collapse;font-size:13px;">${rows || '<tr><td style="padding:4px 8px;">Aucun</td></tr>'}</table>`);
    }
    if (enabledStats.includes('resolved_period') || enabledStats.includes('new_period') || enabledStats.includes('removed_period')) {
      const cells: string[] = [];
      if (enabledStats.includes('new_period')) cells.push(`<td style="padding:8px;text-align:center;"><div style="font-size:20px;font-weight:700;">${stats.newPeriod}</div><div style="font-size:11px;color:#777;">Nouveaux</div></td>`);
      if (enabledStats.includes('resolved_period')) cells.push(`<td style="padding:8px;text-align:center;"><div style="font-size:20px;font-weight:700;color:#3BD16F;">${stats.resolvedPeriod}</div><div style="font-size:11px;color:#777;">Résolus</div></td>`);
      if (enabledStats.includes('removed_period')) cells.push(`<td style="padding:8px;text-align:center;"><div style="font-size:20px;font-weight:700;color:#999;">${stats.removedPeriod}</div><div style="font-size:11px;color:#777;">Retirés</div></td>`);
      html += section('Activité de la période', `<table style="width:100%;"><tr>${cells.join('')}</tr></table>`);
    }
    if (enabledStats.includes('ranking')) {
      html += section(
        'Classement (TOP 100 municipalités)',
        stats.ranking.myRank
          ? `<p style="font-size:13px;margin:0;">Rang <strong>${stats.ranking.myRank}</strong> sur ${stats.ranking.totalRanked} — plus de signalements actifs signifie un rang moins bon.</p>`
          : `<p style="font-size:13px;margin:0;color:#777;">Pas assez de signalements actifs pour figurer dans le classement.</p>`,
      );
    }
    if (enabledStats.includes('resolution_performance')) {
      html += section(
        'Performance de résolution',
        `<p style="font-size:13px;margin:0;">Taux de résolution : <strong>${stats.resolutionPerformance.rate !== null ? stats.resolutionPerformance.rate + ' %' : 'N/D'}</strong><br />Temps moyen de résolution : <strong>${stats.resolutionPerformance.avgResolutionDays !== null ? stats.resolutionPerformance.avgResolutionDays + ' jours' : 'N/D'}</strong></p>`,
      );
    }
    if (enabledStats.includes('problematic_zones')) {
      const frontendUrl = process.env.FRONTEND_URL ?? 'https://mon511.ca';
      // Zoom 17 — assez rapproché pour bien voir les signalements
      // individuels d'une zone d'environ 150 mètres (le standard de
      // regroupement établi ci-dessus, voir computeReportStats).
      const rows = stats.problematicZones.slice(0, 10).map((z) => {
        const label = z.civicRange ? `${z.civicRange} ${z.streetName}` : z.streetName;
        const url = `${frontendUrl}/?lat=${z.centerLat}&lng=${z.centerLng}&zoom=17`;
        return `<tr><td style="padding:4px 8px;"><a href="${url}" style="color:#FF5A1F;text-decoration:none;">${label}</a></td><td style="padding:4px 8px;text-align:right;">${z.count}</td></tr>`;
      }).join('');
      html += section('Zones routières les plus problématiques', `<table style="width:100%;border-collapse:collapse;font-size:13px;">${rows || '<tr><td style="padding:4px 8px;">Aucune</td></tr>'}</table>`);
    }
    if (enabledStats.includes('most_confirmed')) {
      const frontendUrl = process.env.FRONTEND_URL ?? 'https://mon511.ca';
      const rows = stats.mostConfirmed.map((r) => {
        const url = `${frontendUrl}/?report=${r.id}`;
        return `<tr><td style="padding:4px 8px;">${r.icon ?? '📍'} ${r.typeName} — <a href="${url}" style="color:#FF5A1F;text-decoration:none;">${r.addressText ?? 'Voir le signalement'}</a></td><td style="padding:4px 8px;text-align:right;">👍 ${r.confirmationsCount}</td></tr>`;
      }).join('');
      html += section('Signalements les plus confirmés ("Présent")', `<table style="width:100%;border-collapse:collapse;font-size:13px;">${rows || '<tr><td style="padding:4px 8px;">Aucun</td></tr>'}</table>`);
    }

    return html;
  }

  /** Envoie le rapport périodique réel à tous les employés (municipal_staff
   * + municipal_admin) de la municipalité — la période est calculée selon
   * la fréquence configurée (semaine ou mois précédent). */
  async sendPeriodicReportEmail(regionId: string) {
    const settings = await this.getReportSettingsForRegion(regionId);
    if (!settings.enabled) return { sent: false, reason: 'rapport désactivé pour cette municipalité' };

    const now = new Date();
    const periodEnd = now;
    const periodStart = new Date(now);
    if (settings.frequency === 'weekly') periodStart.setDate(periodStart.getDate() - 7);
    else periodStart.setMonth(periodStart.getMonth() - 1);

    const stats = await this.computeReportStats(regionId, periodStart, periodEnd);
    const html = this.renderReportStatsHtml(stats, settings.enabled_stats as string[]);

    const recipients = await this.db
      .selectFrom('users')
      .innerJoin('roles', 'roles.id', 'users.role_id')
      .select('users.email')
      .where('users.region_id', '=', regionId)
      .where('roles.name', 'in', ['municipal_staff', 'municipal_admin'])
      .execute();

    for (const r of recipients) {
      this.email
        .send(
          r.email,
          `Rapport ${settings.frequency === 'weekly' ? 'hebdomadaire' : 'mensuel'} — ${stats.regionName} — mon511.ca`,
          `Voici le rapport ${settings.frequency === 'weekly' ? 'hebdomadaire' : 'mensuel'} des signalements pour ${stats.regionName}.`,
          { extraHtml: html },
        )
        .catch(() => {});
    }

    await this.db.updateTable('municipality_report_settings').set({ last_report_sent_at: new Date() as any }).where('region_id', '=', regionId).execute();
    return { sent: true, recipientCount: recipients.length };
  }

  /** Envoi de TEST — même contenu que le vrai rapport (période des 30
   * derniers jours, statistiques activées actuelles), mais envoyé
   * seulement à l'adresse fournie, jamais aux vrais employés
   * municipaux, et ne met jamais à jour last_report_sent_at. */
  async sendTestReportEmail(regionId: string, testEmail: string) {
    const settings = await this.getReportSettingsForRegion(regionId);
    const periodEnd = new Date();
    const periodStart = new Date();
    periodStart.setDate(periodStart.getDate() - 30);

    const stats = await this.computeReportStats(regionId, periodStart, periodEnd);
    const html = this.renderReportStatsHtml(stats, settings.enabled_stats as string[]);

    await this.email.send(
      testEmail,
      `[TEST] Rapport municipal — ${stats.regionName} — mon511.ca`,
      `Ceci est un envoi de test du rapport municipal pour ${stats.regionName} (période des 30 derniers jours, à titre d'exemple).`,
      { extraHtml: html },
    );
    return { sent: true };
  }
}
