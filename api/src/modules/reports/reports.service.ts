import { BadRequestException, ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { CreateReportDto } from './dto/create-report.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ReputationService } from '../reputation/reputation.service';
import { EmailService } from '../../email/email.service';
import { formatDisplayName } from '../../common/display-name.util';
import { PostsService } from '../posts/posts.service';

@Injectable()
export class ReportsService {
  constructor(
    @Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>,
    private readonly notifications: NotificationsService,
    private readonly reputationService: ReputationService,
    private readonly email: EmailService,
    private readonly posts: PostsService,
  ) {}

  /**
   * Signalements dans un rayon donné — la requête "près de moi" qui
   * alimente la carte. ST_DWithin utilise l'index GIST sur `location`
   * (voir migration 0001_init.sql) pour rester performant à grande échelle.
   */
  async findNearby(lat: number, lng: number, radiusMeters = 5000, currentUserId?: string) {
    return this.db
      .selectFrom('reports')
      .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .select([
        'reports.id',
        'reports.status',
        'reports.description',
        'reports.address_text as addressText',
        'reports.created_at',
        'reports.problem_type_id as problemTypeId',
        'problem_types.name_fr as problemTypeNameFr',
        'problem_types.name_en as problemTypeNameEn',
        'problem_types.icon as problemTypeIcon',
        sql<number>`ST_X(reports.location::geometry)`.as('longitude'),
        sql<number>`ST_Y(reports.location::geometry)`.as('latitude'),
        sql<string | null>`(SELECT url FROM report_photos WHERE report_photos.report_id = reports.id ORDER BY uploaded_at ASC LIMIT 1)`.as('thumbnailUrl'),
      ])
      .where((eb) =>
        currentUserId
          // L'auteur voit aussi son propre signalement en attente d'approbation
          // — invisible pour tout le monde d'autre, mais pas pour lui-même.
          ? eb.or([
              eb('reports.status', 'in', ['published_unresolved', 'published_resolved']),
              eb.and([eb('reports.status', '=', 'pending_moderation'), eb('reports.user_id', '=', currentUserId)]),
            ])
          : eb('reports.status', 'in', ['published_unresolved', 'published_resolved']),
      )
      .where(
        sql<boolean>`ST_DWithin(reports.location::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters})`,
      )
      .orderBy('reports.created_at', 'desc')
      .limit(1500)
      .execute();
  }

  /** Recherche des signalements ARCHIVÉS à proximité d'un point — utilisé à
   * la création d'un nouveau signalement pour proposer de réutiliser les
   * informations et photos d'un signalement antérieur au même endroit
   * plutôt que de tout ressaisir. Le rayon est configurable dans l'admin
   * (site_settings.lifecycle_days.duplicateDetectionRadiusMeters). */
  /** Recherche des signalements EXISTANTS à proximité d'un point — utilisé à
   * la création d'un nouveau signalement pour éviter les vrais doublons :
   * - actifs (déjà publiés, en cours de traitement) → proposer de confirmer
   *   celui-là plutôt que d'en créer un nouveau
   * - archivés → proposer de réutiliser ses informations/photos comme point
   *   de départ (le problème est peut-être revenu)
   * Le rayon est configurable dans l'admin
   * (site_settings.lifecycle_days.duplicateDetectionRadiusMeters). */
  async findNearbyExisting(lat: number, lng: number) {
    const setting = await this.db
      .selectFrom('site_settings')
      .select('value')
      .where('key', '=', 'lifecycle_days')
      .executeTakeFirst();
    const radiusMeters = (setting?.value as any)?.duplicateDetectionRadiusMeters ?? 15;

    const results = await this.db
      .selectFrom('reports')
      .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .leftJoin('users', 'users.id', 'reports.user_id')
      .select([
        'reports.id', 'reports.description', 'reports.address_text as addressText',
        'reports.problem_type_id as problemTypeId', 'reports.archived_at as archivedAt',
        'reports.status',
        'problem_types.name_fr as problemTypeNameFr', 'problem_types.name_en as problemTypeNameEn',
        'problem_types.icon as problemTypeIcon',
        'users.first_name as authorFirstName',
        sql<string[]>`(SELECT array_agg(url) FROM report_photos WHERE report_photos.report_id = reports.id)`.as('photoUrls'),
      ])
      .where('reports.status', 'in', ['published_unresolved', 'published_resolved', 'archived'])
      .where(
        sql<boolean>`ST_DWithin(reports.location::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters})`,
      )
      .orderBy('reports.created_at', 'desc')
      .limit(3)
      .execute();

    return results.map((r) => ({ ...r, matchType: r.status === 'archived' ? 'archived' : 'active' }));
  }

  async findOne(id: string) {
    const report = await this.db
      .selectFrom('reports')
      .leftJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .leftJoin('users', 'users.id', 'reports.user_id')
      .select([
        'reports.id', 'reports.status', 'reports.description', 'reports.address_text as addressText',
        'reports.created_at', 'reports.updated_at', 'reports.resolved_at',
        'reports.municipality_notified', 'reports.municipality_name',
        'problem_types.name_fr as problemTypeNameFr', 'problem_types.name_en as problemTypeNameEn', 'problem_types.icon as problemTypeIcon',
        'users.id as authorId', 'users.email as authorEmail', 'users.first_name as authorFirstName',
        'users.last_name as authorLastName', 'users.privacy_settings as authorPrivacySettings',
        sql<number>`ST_Y(reports.location::geometry)`.as('latitude'),
        sql<number>`ST_X(reports.location::geometry)`.as('longitude'),
      ])
      .where('reports.id', '=', id)
      .executeTakeFirst();

    if (!report) throw new NotFoundException('Signalement introuvable.');

    const photos = await this.db
      .selectFrom('report_photos')
      .select(['id', 'url'])
      .where('report_id', '=', id)
      .execute();

    const confirmationsCount = await this.db
      .selectFrom('report_confirmations')
      .select(({ fn }) => fn.count<number>('id').as('count'))
      .where('report_id', '=', id)
      .executeTakeFirst();

    // Nombre de suggestions de résolution en attente — permet au
    // propriétaire (vérifié côté frontend via authorId === currentUserId)
    // de voir directement sur la carte que d'autres membres pensent que
    // c'est résolu, sans devoir passer par « Mes signalements ».
    const pendingResolutionSuggestions = await this.db
      .selectFrom('report_resolution_suggestions')
      .select(({ fn }) => fn.count<number>('id').as('count'))
      .where('report_id', '=', id)
      .where('status', '=', 'pending')
      .executeTakeFirst();

    const authorSettings = report.authorPrivacySettings as any;
    const authorDisplayName = report.authorId
      ? formatDisplayName(report.authorFirstName, report.authorLastName, authorSettings?.last_name_display, report.authorEmail ?? '')
      : null;

    return {
      ...report,
      photos,
      confirmationsCount: confirmationsCount?.count ?? 0,
      pendingResolutionSuggestionsCount: pendingResolutionSuggestions?.count ?? 0,
      authorDisplayName,
    };
  }

  /** Détail enrichi pour l'auteur seulement — inclut ce qui n'est pas
   * public (historique de statut, signalements d'abus reçus, suggestions
   * de résolution), en plus de ce que findOne() retourne déjà. */
  async findOwnDetail(id: string, userId: string) {
    const base = await this.findOne(id);
    const report = await this.db.selectFrom('reports').select(['user_id', 'problem_type_id']).where('id', '=', id).executeTakeFirst();
    if (!report || report.user_id !== userId) throw new ForbiddenException("Ce signalement ne t'appartient pas.");

    const statusHistory = await this.db
      .selectFrom('report_status_history')
      .select(['old_status', 'new_status', 'reason', 'changed_at'])
      .where('report_id', '=', id)
      .orderBy('changed_at', 'desc')
      .execute();

    const flags = await this.db
      .selectFrom('report_flags')
      .select(['reason', 'notes', 'created_at', 'handled_at'])
      .where('report_id', '=', id)
      .orderBy('created_at', 'desc')
      .execute();

    const resolutionSuggestions = await this.db
      .selectFrom('report_resolution_suggestions')
      .select(['comment', 'weight', 'status', 'created_at'])
      .where('report_id', '=', id)
      .orderBy('created_at', 'desc')
      .execute();

    // Échange avec la modération — jusqu'ici visible seulement côté admin
    // (File de modération), invisible pour le propriétaire lui-même. Un
    // modérateur qui écrit un message avant d'approuver/refuser un
    // signalement doit pouvoir être vu ET répondu par l'usager concerné.
    const messages = await this.db
      .selectFrom('report_messages')
      .innerJoin('users', 'users.id', 'report_messages.author_id')
      .select(['report_messages.id', 'report_messages.message', 'report_messages.author_role', 'report_messages.created_at', 'users.email as authorEmail'])
      .where('report_messages.report_id', '=', id)
      .orderBy('report_messages.created_at', 'asc')
      .execute();

    return { ...base, problemTypeId: report.problem_type_id, statusHistory, flags, resolutionSuggestions, messages };
  }

  /** Édition par l'auteur — seuls certains champs sont modifiables, jamais
   * le type ou la position (pour éviter les abus, un nouveau signalement
   * s'impose si l'emplacement était vraiment erroné). */
  async updateOwn(reportId: string, userId: string, changes: { description?: string; addressText?: string; municipalityNotified?: 'yes' | 'no' | 'unknown'; municipalityName?: string; problemTypeId?: string }) {
    const report = await this.db.selectFrom('reports').select(['user_id', 'status']).where('id', '=', reportId).executeTakeFirst();
    if (!report) throw new NotFoundException('Signalement introuvable.');
    if (report.user_id !== userId) throw new ForbiddenException("Ce signalement ne t'appartient pas.");

    // Un signalement refusé qu'on corrige repasse automatiquement par la
    // modération — la correction ne le republie pas directement, elle
    // demande simplement un nouveau regard humain dessus.
    const wasRejected = report.status === 'rejected';

    await this.db
      .updateTable('reports')
      .set({
        ...(changes.description !== undefined && { description: changes.description }),
        ...(changes.addressText !== undefined && { address_text: changes.addressText }),
        ...(changes.municipalityNotified !== undefined && { municipality_notified: changes.municipalityNotified }),
        ...(changes.municipalityName !== undefined && { municipality_name: changes.municipalityName }),
        ...(changes.problemTypeId !== undefined && { problem_type_id: changes.problemTypeId }),
        ...(wasRejected && { status: 'pending_moderation' as any, rejected_at: null as any }),
        updated_at: new Date() as any,
      })
      .where('id', '=', reportId)
      .execute();

    if (wasRejected) {
      await this.db
        .insertInto('report_status_history')
        .values({
          report_id: reportId,
          old_status: 'rejected',
          new_status: 'pending_moderation',
          changed_by: userId,
          reason: "Corrigé par l'auteur suite au refus — nouvelle révision demandée.",
        })
        .execute();
    }

    return this.findOwnDetail(reportId, userId);
  }

  /** Le propriétaire confirme directement que son signalement est résolu —
   * indépendant du seuil de poids communautaire (report_resolution_suggestions),
   * qui reste le mécanisme pour les AUTRES membres. Le propriétaire, lui,
   * n'a pas besoin d'attendre ce seuil : sa propre confirmation suffit. */
  async ownerConfirmResolved(reportId: string, userId: string) {
    const report = await this.db.selectFrom('reports').select(['user_id', 'status']).where('id', '=', reportId).executeTakeFirst();
    if (!report) throw new NotFoundException('Signalement introuvable.');
    if (report.user_id !== userId) throw new ForbiddenException("Ce signalement ne t'appartient pas.");
    if (report.status === 'published_resolved') return { alreadyResolved: true };

    await this.db.transaction().execute(async (trx) => {
      await trx
        .updateTable('reports')
        .set({ status: 'published_resolved', resolved_at: new Date() as any })
        .where('id', '=', reportId)
        .execute();
      await trx
        .updateTable('report_resolution_suggestions')
        .set({ status: 'accepted' })
        .where('report_id', '=', reportId)
        .where('status', '=', 'pending')
        .execute();
      await trx
        .insertInto('report_status_history')
        .values({
          report_id: reportId,
          old_status: report.status as any,
          new_status: 'published_resolved',
          changed_by: userId,
          reason: 'Confirmé résolu directement par le propriétaire du signalement.',
        })
        .execute();
    });

    return { alreadyResolved: false };
  }

  /** Le propriétaire répond dans l'échange avec la modération — jusqu'ici
   * réservé aux modérateurs eux-mêmes (via ModerationService.reply, même
   * table report_messages, juste author_role différent). */
  async replyAsOwner(reportId: string, userId: string, message: string) {
    const report = await this.db.selectFrom('reports').select('user_id').where('id', '=', reportId).executeTakeFirst();
    if (!report) throw new NotFoundException('Signalement introuvable.');
    if (report.user_id !== userId) throw new ForbiddenException("Ce signalement ne t'appartient pas.");

    return this.db
      .insertInto('report_messages')
      .values({ report_id: reportId, author_id: userId, author_role: 'user', message })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async withdrawOwn(reportId: string, userId: string) {
    const report = await this.db.selectFrom('reports').select(['user_id']).where('id', '=', reportId).executeTakeFirst();
    if (!report) throw new NotFoundException('Signalement introuvable.');
    if (report.user_id !== userId) throw new ForbiddenException("Ce signalement ne t'appartient pas.");

    await this.db
      .updateTable('reports')
      .set({ status: 'withdrawn', updated_at: new Date() as any })
      .where('id', '=', reportId)
      .execute();

    return { withdrawn: true };
  }

  async deleteOwnPhoto(reportId: string, photoId: string, userId: string) {
    const report = await this.db.selectFrom('reports').select(['user_id']).where('id', '=', reportId).executeTakeFirst();
    if (!report) throw new NotFoundException('Signalement introuvable.');
    if (report.user_id !== userId) throw new ForbiddenException("Ce signalement ne t'appartient pas.");

    await this.db.deleteFrom('report_photos').where('id', '=', photoId).where('report_id', '=', reportId).execute();
    return { deleted: true };
  }

  /**
   * Crée un signalement. La région est dérivée automatiquement par jointure
   * spatiale avec `regions` (§3 du modèle de données) — l'usager n'a jamais
   * à la sélectionner lui-même.
   */
  /** Compte de signalements actifs (non résolus + résolus) pour une
   * municipalité identifiée par NOM plutôt que par ID — utilisé par le
   * badge "X signalements à <ville>" de la carte, qui ne connaît que le
   * nom détecté par géolocalisation inverse côté client, pas l'ID de la
   * région. Réutilise exactement la même correspondance par nom (ilike)
   * que create() utilise pour associer un signalement à sa municipalité
   * à la création, pour rester cohérent avec le vrai region_id stocké
   * plutôt que de deviner à partir du texte de l'adresse (fragile —
   * l'adresse est un champ optionnel, plusieurs signalements n'en ont
   * pas). */
  async countByMunicipalityName(name: string): Promise<number> {
    const region = await this.db
      .selectFrom('regions')
      .select('id')
      .where('type', '=', 'municipality')
      .where('name_fr', 'ilike', name.trim())
      .executeTakeFirst();
    if (!region) return 0;

    const result = await this.db
      .selectFrom('reports')
      .select(sql<number>`count(*)`.as('count'))
      .where('region_id', '=', region.id)
      .where('status', 'in', ['published_unresolved', 'published_resolved'])
      .executeTakeFirst();
    return Number(result?.count ?? 0);
  }

  async create(userId: string | null, dto: CreateReportDto) {
    const report = await this.db.transaction().execute(async (trx) => {
      let region = await trx
        .selectFrom('regions')
        .select('id')
        .where('type', '=', 'municipality')
        .where(
          sql<boolean>`ST_Contains(boundary, ST_SetSRID(ST_MakePoint(${dto.longitude}, ${dto.latitude}), 4326))`,
        )
        .executeTakeFirst();

      // Repli par nom : on n'a pas encore importé de vraies frontières
      // géographiques pour la plupart des municipalités (boundary est NULL),
      // donc ST_Contains ne trouve rien la plupart du temps. En attendant,
      // on utilise le nom de municipalité détecté par géolocalisation
      // inverse côté client — la modération humaine reste le filet de
      // sécurité si jamais la correspondance est imprécise près d'une
      // frontière (voir moderation.service.ts, écran d'approbation).
      if (!region && dto.municipalityHint) {
        region = await trx
          .selectFrom('regions')
          .select('id')
          .where('type', '=', 'municipality')
          .where('name_fr', 'ilike', dto.municipalityHint.trim())
          .executeTakeFirst();
      }

      const report = await trx
        .insertInto('reports')
        .values({
          user_id: userId,
          problem_type_id: dto.problemTypeId,
          region_id: region?.id ?? null,
          location: sql`ST_SetSRID(ST_MakePoint(${dto.longitude}, ${dto.latitude}), 4326)` as any,
          gps_accuracy_m: dto.gpsAccuracyM ?? null,
          address_text: dto.addressText ?? null,
          description: dto.description ?? null,
          municipality_notified: dto.municipalityNotified,
          municipality_name: dto.municipalityName ?? null,
          municipality_case_number: dto.municipalityCaseNumber ?? null,
        })
        .returning('id')
        .executeTakeFirstOrThrow();

      // Statut initial toujours en attente de modération — cohérent avec
      // site_settings.require_moderation, appliqué au niveau applicatif
      // (le worker de modération/publication est un chantier séparé).
      await trx
        .insertInto('report_status_history')
        .values({
          report_id: report.id,
          old_status: null,
          new_status: 'pending_moderation',
          changed_by: userId,
          reason: null,
        })
        .execute();

      return report;
    });

    // Courriel de confirmation à l'auteur — après la transaction, pour ne
    // jamais faire échouer la création d'un signalement si l'envoi du
    // courriel a un problème (SMTP temporairement en panne, etc.).
    if (userId) {
      this.sendSubmissionConfirmation(report.id).catch(() => {});

      // Partage automatique dans le fil communautaire (et donc,
      // implicitement, sur la page publique de la municipalité concernée
      // — voir posts.service.ts, qui hérite region_id du signalement
      // partagé) — plus une case à cocher, tous les signalements
      // apparaissent maintenant dans le fil par défaut. Même esprit que
      // le courriel : un échec ici ne doit jamais faire échouer la
      // création du signalement lui-même, déjà réussie à ce stade.
      // Jamais pour un signalement anonyme (userId null), qui n'a pas
      // d'auteur à qui attribuer la publication.
      this.posts.createPost(userId, { category: 'road_conditions', visibility: 'public', reportId: report.id }).catch(() => {});
    }

    return report;
  }

  private async sendSubmissionConfirmation(reportId: string) {
    const report = await this.db
      .selectFrom('reports')
      .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .leftJoin('users', 'users.id', 'reports.user_id')
      .leftJoin('regions', 'regions.id', 'reports.region_id')
      .select([
        'reports.id', 'reports.address_text', 'reports.created_at',
        'problem_types.name_fr as problemTypeNameFr',
        'users.email', 'users.first_name',
        'regions.name_fr as municipalityName',
        sql<string | null>`(SELECT url FROM report_photos WHERE report_photos.report_id = reports.id ORDER BY uploaded_at ASC LIMIT 1)`.as('photoUrl'),
      ])
      .where('reports.id', '=', reportId)
      .executeTakeFirst();
    if (!report?.email) return;

    const frontendUrl = process.env.FRONTEND_URL ?? 'https://mon511.ca';
    await this.email.sendTemplated('report_received', report.email, {
      firstName: report.first_name ?? '',
      reportType: report.problemTypeNameFr,
      reportDate: new Date(report.created_at as any).toLocaleDateString('fr-CA', { year: 'numeric', month: 'long', day: 'numeric' }),
      reportStatus: 'En attente de modération',
      reportAddress: report.address_text ?? 'Position GPS',
      reportMunicipality: report.municipalityName ?? '',
      reportPhotoUrl: report.photoUrl ?? '',
      reportUrl: `${frontendUrl}/?report=${report.id}`,
    }, { ctaLabel: 'Voir mon signalement', ctaUrl: `${frontendUrl}/?report=${report.id}` });
  }

  /**
   * Suggestion communautaire "marqué résolu" — §17 du modèle de données.
   * Le poids est calculé depuis la réputation du suggérant; si le total
   * atteint le seuil configuré, le signalement passe à résolu.
   */
  async suggestResolution(reportId: string, userId: string, comment?: string) {
    const result = await this.db.transaction().execute(async (trx) => {
      const user = await trx
        .selectFrom('users')
        .select('reputation_score')
        .where('id', '=', userId)
        .executeTakeFirstOrThrow();

      const weight = 1 + Math.min(Math.floor(user.reputation_score / 50), 2);

      // Une contrainte unique (report_id, suggested_by) empêche déjà les
      // doublons en base — sans onConflict, une deuxième tentative du même
      // usager faisait planter toute la requête (erreur 500 opaque) au
      // lieu d'être simplement ignorée proprement.
      const insertResult = await trx
        .insertInto('report_resolution_suggestions')
        .values({ report_id: reportId, suggested_by: userId, comment: comment ?? null, weight })
        .onConflict((oc) => oc.doNothing())
        .executeTakeFirst();
      const alreadySuggested = !insertResult.numInsertedOrUpdatedRows || insertResult.numInsertedOrUpdatedRows === 0n;

      const totalWeight = await trx
        .selectFrom('report_resolution_suggestions')
        .select(({ fn }) => fn.sum<number>('weight').as('total'))
        .where('report_id', '=', reportId)
        .where('status', '=', 'pending')
        .executeTakeFirst();

      const threshold = await trx
        .selectFrom('site_settings')
        .select('value')
        .where('key', '=', 'resolution_suggestion_threshold')
        .executeTakeFirst();

      const thresholdValue = Number(threshold?.value ?? 5);
      const autoResolved = (totalWeight?.total ?? 0) >= thresholdValue;

      if (autoResolved) {
        await trx
          .updateTable('reports')
          .set({ status: 'published_resolved', resolved_at: new Date() as any })
          .where('id', '=', reportId)
          .execute();

        await trx
          .insertInto('report_status_history')
          .values({
            report_id: reportId,
            old_status: 'published_unresolved',
            new_status: 'published_resolved',
            changed_by: null,
            reason: 'seuil communautaire pondéré atteint',
          })
          .execute();

        await trx
          .updateTable('report_resolution_suggestions')
          .set({ status: 'accepted' })
          .where('report_id', '=', reportId)
          .where('status', '=', 'pending')
          .execute();
      }

      return { weight, autoResolved, alreadySuggested };
    });

    // Notification à l'auteur — dans tous les cas une suggestion arrive,
    // et en plus une notification de résolution si le seuil est atteint.
    const report = await this.db
      .selectFrom('reports')
      .select('user_id')
      .where('id', '=', reportId)
      .executeTakeFirst();

    if (report?.user_id) {
      await this.notifications.create({
        userId: report.user_id,
        type: result.autoResolved ? 'report_marked_resolved' : 'resolution_suggested',
        reportId,
        actorId: userId,
        title: result.autoResolved
          ? 'Ton signalement a été marqué résolu par la communauté'
          : 'Quelqu\'un pense que ton signalement est résolu',
        body: comment,
      });
    }

    return result;
  }

  /** Confirmation communautaire ("je confirme que ce problème existe toujours"). */

  /** Confirmation communautaire ("je confirme que ce problème existe toujours"). */
  async confirm(reportId: string, userId: string) {
    const result = await this.db
      .insertInto('report_confirmations')
      .values({ report_id: reportId, user_id: userId })
      .onConflict((oc) => oc.doNothing())
      .executeTakeFirst();

    // Seulement si c'est une vraie nouvelle confirmation (pas un doublon ignoré).
    const isNew = !!result.numInsertedOrUpdatedRows && result.numInsertedOrUpdatedRows > 0n;
    if (isNew) {
      const report = await this.db.selectFrom('reports').select('user_id').where('id', '=', reportId).executeTakeFirst();
      await this.reputationService.award(userId, 'gave_confirmation', reportId);
      if (report?.user_id) await this.reputationService.award(report.user_id, 'report_confirmed_by_other', reportId, userId);
      // Remet le compteur de fraîcheur à zéro — évite l'archivage automatique
      // du cycle de vie (voir LifecycleService) tant que quelqu'un confirme
      // régulièrement que le problème existe encore.
      await this.db
        .updateTable('reports')
        .set({ last_confirmed_at: new Date() as any, staleness_reminder_sent_at: null as any })
        .where('id', '=', reportId)
        .execute();
    }

    // Ne jamais retourner l'objet brut de Kysely — il contient un compteur
    // de type BigInt (numInsertedOrUpdatedRows) qu'Express/JSON.stringify
    // ne sait pas sérialiser, ce qui faisait planter la requête avec une
    // erreur 500 opaque côté client.
    return { confirmed: isNew };
  }

  /** Confirmation via le lien reçu par courriel (rappel à 30 jours) — pas
   * besoin d'être connecté, le jeton prouve l'identité. Compte comme une
   * confirmation par le propriétaire lui-même. */
  async confirmViaToken(token: string) {
    const record = await this.db
      .selectFrom('report_confirmation_tokens')
      .selectAll()
      .where('token', '=', token)
      .executeTakeFirst();

    if (!record) throw new NotFoundException('Lien de confirmation invalide ou expiré.');
    if (record.used_at) return { alreadyUsed: true, reportId: record.report_id };
    if (new Date(record.expires_at) < new Date()) throw new BadRequestException('Ce lien de confirmation a expiré.');

    const report = await this.db.selectFrom('reports').select(['id', 'user_id']).where('id', '=', record.report_id).executeTakeFirst();
    if (!report) throw new NotFoundException('Signalement introuvable.');

    await this.db
      .updateTable('reports')
      .set({ last_confirmed_at: new Date() as any, staleness_reminder_sent_at: null as any })
      .where('id', '=', report.id)
      .execute();

    await this.db
      .updateTable('report_confirmation_tokens')
      .set({ used_at: new Date() as any })
      .where('token', '=', token)
      .execute();

    if (report.user_id) await this.reputationService.award(report.user_id, 'gave_confirmation', report.id);

    return { alreadyUsed: false, reportId: report.id };
  }

  /** Signalement d'un problème avec le signalement lui-même (doublon, inapproprié, etc.). */
  async flag(reportId: string, userId: string, reason: string, notes?: string) {
    return this.db
      .insertInto('report_flags')
      .values({ report_id: reportId, user_id: userId, reason: reason as any, notes: notes ?? null })
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
