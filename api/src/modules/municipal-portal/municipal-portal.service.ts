import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { EmailService } from '../../email/email.service';
import { formatDisplayName } from '../../common/display-name.util';

@Injectable()
export class MunicipalPortalService {
  constructor(
    @Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>,
    private readonly email: EmailService,
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

  /** Page publique d'une municipalité — accessible à tout le monde, pas
   * seulement les usagers connectés. Existe pour TOUTE municipalité dès
   * maintenant, peu importe si elle a déjà été « réclamée » par un
   * premier membre ou non — voir requestAccess() pour la façon dont ce
   * gestionnaire est attribué automatiquement, sans lien avec l'existence
   * de cette page elle-même. */
  async findPublicMunicipalityPage(regionId: string) {
    const region = await this.db.selectFrom('regions').select(['id', 'name_fr as nameFr']).where('id', '=', regionId).where('type', '=', 'municipality').executeTakeFirst();
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

    // Premier membre approuvé pour cette municipalité — devient
    // automatiquement gestionnaire principal (municipal_admin), sans
    // attendre l'approbation d'un admin du site : personne d'autre
    // n'existe encore pour approuver, et attendre bloquerait
    // indéfiniment la toute première inscription d'une municipalité.
    const existingStaff = await this.db
      .selectFrom('users')
      .innerJoin('roles', 'roles.id', 'users.role_id')
      .select('users.id')
      .where('users.region_id', '=', regionId)
      .where('roles.name', 'in', ['municipal_staff', 'municipal_admin'])
      .executeTakeFirst();

    if (!existingStaff) {
      await this.applyApproval(request.id, userId, regionId, 'municipal_admin', userId);
    }

    return request;
  }

  /** Logique d'approbation partagée — réutilisée par l'auto-approbation du
   * premier membre ET l'approbation manuelle (par un admin du site ou par
   * le gestionnaire municipal déjà en place pour cette région). */
  private async applyApproval(requestId: string, targetUserId: string, regionId: string, roleName: 'municipal_staff' | 'municipal_admin', reviewerId: string) {
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
  async findMyAccessStatus(userId: string) {
    const user = await this.db.selectFrom('users').innerJoin('roles', 'roles.id', 'users.role_id').select(['roles.name as roleName', 'users.region_id']).where('users.id', '=', userId).executeTakeFirst();
    if (user?.roleName === 'municipal_staff' || user?.roleName === 'municipal_admin') {
      return { status: 'approved' as const, regionId: user.region_id };
    }
    const request = await this.db
      .selectFrom('municipality_access_requests')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('requested_at', 'desc')
      .executeTakeFirst();
    return { status: request?.status ?? 'none', regionId: request?.region_id ?? null };
  }

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

  async findPendingAccessRequestsForReviewer(userId: string) {
    const { regionId } = await this.getScopeOrThrow(userId);
    return this.findPendingAccessRequests(regionId);
  }

  /** File de modération des signalements — SEULEMENT ceux de la propre
   * municipalité de l'appelant, contrairement à la file générale des
   * modérateurs du site qui voit tout. */
  async findMyRegionReportsQueue(userId: string) {
    const { regionId } = await this.getScopeOrThrow(userId);
    return this.db
      .selectFrom('reports')
      .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .select([
        'reports.id', 'reports.description', 'reports.address_text', 'reports.status', 'reports.created_at',
        'problem_types.name_fr as problemTypeNameFr', 'problem_types.icon as problemTypeIcon',
        sql<string | null>`(SELECT url FROM report_photos WHERE report_photos.report_id = reports.id ORDER BY uploaded_at ASC LIMIT 1)`.as('thumbnailUrl'),
      ])
      .where('reports.region_id', '=', regionId)
      .where('reports.status', 'in', ['pending_moderation', 'published_unresolved'])
      .orderBy('reports.created_at', 'desc')
      .execute();
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
}
