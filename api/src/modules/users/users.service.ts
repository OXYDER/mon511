import { BadRequestException, Inject, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Kysely } from 'kysely';
import * as bcrypt from 'bcrypt';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ChangePasswordDto } from './dto/change-password.dto';
import { VerificationService } from '../../verification/verification.service';
import { EmailService } from '../../email/email.service';

@Injectable()
export class UsersService {
  constructor(
    @Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>,
    private readonly verification: VerificationService,
    private readonly email: EmailService,
  ) {}

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    await this.db
      .updateTable('users')
      .set({
        ...(dto.firstName !== undefined && { first_name: dto.firstName }),
        ...(dto.lastName !== undefined && { last_name: dto.lastName }),
        updated_at: new Date() as any,
      })
      .where('id', '=', userId)
      .execute();
    return this.findById(userId);
  }

  async requestPasswordChange(userId: string, dto: ChangePasswordDto) {
    const user = await this.db
      .selectFrom('users')
      .select(['email', 'password_hash'])
      .where('id', '=', userId)
      .executeTakeFirst();

    if (!user?.password_hash) {
      throw new BadRequestException("Ce compte n'a pas de mot de passe local (connexion externe).");
    }

    const valid = await bcrypt.compare(dto.currentPassword, user.password_hash);
    if (!valid) throw new UnauthorizedException('Mot de passe actuel incorrect.');

    const newHash = await bcrypt.hash(dto.newPassword, 12);
    await this.verification.createAndSend(
      user.email,
      'password_change',
      userId,
      { newPasswordHash: newHash },
    );

    return { pendingConfirmation: true };
  }

  async confirmPasswordChange(userId: string, code: string) {
    const user = await this.db.selectFrom('users').select(['email']).where('id', '=', userId).executeTakeFirstOrThrow();
    const metadata = await this.verification.verify(user.email, 'password_change', code);
    const newPasswordHash = metadata?.newPasswordHash as string | undefined;
    if (!newPasswordHash) throw new BadRequestException('Code invalide pour ce changement.');

    await this.db
      .updateTable('users')
      .set({ password_hash: newPasswordHash, updated_at: new Date() as any })
      .where('id', '=', userId)
      .execute();

    return { changed: true };
  }

  async requestEmailChange(userId: string, newEmail: string) {
    const existing = await this.db.selectFrom('users').select('id').where('email', '=', newEmail).executeTakeFirst();
    if (existing) throw new BadRequestException('Cette adresse courriel est déjà utilisée par un autre compte.');

    await this.verification.createAndSend(
      newEmail,
      'email_change',
      userId,
      { newEmail },
    );

    return { pendingConfirmation: true };
  }

  async confirmEmailChange(userId: string, newEmail: string, code: string) {
    const metadata = await this.verification.verify(newEmail, 'email_change', code);
    const confirmedEmail = metadata?.newEmail as string | undefined;
    if (!confirmedEmail || confirmedEmail !== newEmail) throw new BadRequestException('Code invalide pour ce changement.');

    const oldUser = await this.db.selectFrom('users').select('email').where('id', '=', userId).executeTakeFirstOrThrow();

    await this.db
      .updateTable('users')
      .set({ email: newEmail, updated_at: new Date() as any })
      .where('id', '=', userId)
      .execute();

    // Avis de sécurité à l'ancienne adresse — pas bloquant si l'envoi échoue.
    this.email
      .sendTemplated('email_changed_old_address', oldUser.email, { newEmail })
      .catch(() => {});

    return { changed: true };
  }

  async findById(id: string) {
    const user = await this.db
      .selectFrom('users')
      .select([
        'id', 'email', 'first_name', 'last_name', 'avatar_url', 'locale',
        'region_id', 'reputation_score', 'privacy_settings', 'map_layer_preferences', 'created_at',
      ])
      .where('id', '=', id)
      .executeTakeFirst();

    if (!user) throw new NotFoundException('Usager introuvable.');
    return user;
  }

  async updateMapLayerPreferences(userId: string, prefs: Partial<{ travaux_routiers: boolean; conditions_hivernales: boolean }>) {
    const current = await this.findById(userId);
    const updated = { ...current.map_layer_preferences, ...prefs };

    await this.db
      .updateTable('users')
      .set({ map_layer_preferences: updated, updated_at: new Date() as any })
      .where('id', '=', userId)
      .execute();

    return updated;
  }

  /** Profil public — respecte privacy_settings de l'usager consulté (§ users, modèle de données). */
  /** Nom d'affichage respectant le réglage de confidentialité choisi par
   * l'usager lui-même — utilisé partout où le nom d'un usager est montré à
   * quelqu'un d'autre (détail d'un signalement, profil public, etc.). */
  formatDisplayName(firstName: string | null, lastName: string | null, lastNameDisplay: 'full' | 'initial' | 'hidden' | undefined, fallbackEmail: string): string {
    const first = firstName || fallbackEmail.split('@')[0];
    if (!lastName || lastNameDisplay === 'hidden' || !lastNameDisplay) return first;
    if (lastNameDisplay === 'initial') return `${first} ${lastName[0].toUpperCase()}.`;
    return `${first} ${lastName}`;
  }

  async findPublicProfile(id: string) {
    const user = await this.findById(id);
    const settings = user.privacy_settings as any;

    const displayName = this.formatDisplayName(user.first_name, user.last_name, settings.last_name_display, user.email);

    let region: { id: string; name_fr: string } | undefined;
    if (settings.show_region && user.region_id) {
      region = await this.db.selectFrom('regions').select(['id', 'name_fr']).where('id', '=', user.region_id).executeTakeFirst();
    }

    let reports: any[] = [];
    if (settings.show_report_history) {
      reports = await this.db
        .selectFrom('reports')
        .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
        .select([
          'reports.id', 'reports.status', 'reports.created_at',
          'problem_types.name_fr as problemTypeNameFr', 'problem_types.name_en as problemTypeNameEn',
          'problem_types.icon as problemTypeIcon',
        ])
        .where('reports.user_id', '=', id)
        .where('reports.status', 'in', ['published_unresolved', 'published_resolved'])
        .orderBy('reports.created_at', 'desc')
        .limit(20)
        .execute();
    }

    return {
      id: user.id,
      displayName,
      avatarUrl: user.avatar_url,
      reputationScore: settings.show_reputation ? user.reputation_score : null,
      regionName: region?.name_fr ?? null,
      memberSince: user.created_at,
      reports,
      showReportHistory: settings.show_report_history,
    };
  }

  async updatePrivacySettings(userId: string, dto: UpdatePrivacyDto) {
    const current = await this.findById(userId);
    const updated = {
      ...current.privacy_settings,
      ...(dto.showReputation !== undefined && { show_reputation: dto.showReputation }),
      ...(dto.showReportHistory !== undefined && { show_report_history: dto.showReportHistory }),
      ...(dto.showRegion !== undefined && { show_region: dto.showRegion }),
      ...(dto.showRealName !== undefined && { show_real_name: dto.showRealName }),
      ...(dto.lastNameDisplay !== undefined && { last_name_display: dto.lastNameDisplay }),
      ...(dto.dmPermission !== undefined && { dm_permission: dto.dmPermission }),
    };

    await this.db
      .updateTable('users')
      .set({ privacy_settings: updated, updated_at: new Date() as any })
      .where('id', '=', userId)
      .execute();

    return updated;
  }

  /** "Mes signalements" — voir maquette page profil. */
  async findMyReports(userId: string) {
    return this.db
      .selectFrom('reports')
      .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .leftJoin('regions', 'regions.id', 'reports.region_id')
      .select([
        'reports.id', 'reports.status', 'reports.created_at',
        'reports.address_text as addressText', 'reports.problem_type_id',
        'problem_types.name_fr as problemTypeNameFr',
        'problem_types.name_en as problemTypeNameEn',
        'problem_types.icon as problemTypeIcon',
        'regions.name_fr as municipalityName',
      ])
      .where('reports.user_id', '=', userId)
      .orderBy('reports.created_at', 'desc')
      .execute();
  }

  /** Liste complète pour l'admin — recherche simple par courriel incluse. */
  async findAllForAdmin(search?: string) {
    let query = this.db
      .selectFrom('users')
      .innerJoin('roles', 'roles.id', 'users.role_id')
      .select([
        'users.id', 'users.email', 'users.first_name', 'users.last_name',
        'users.status', 'users.reputation_score', 'users.created_at',
        'roles.name as roleName', 'roles.id as roleId',
      ])
      .orderBy('users.created_at', 'desc')
      .limit(200);

    if (search) {
      query = query.where('users.email', 'ilike', `%${search}%`);
    }

    return query.execute();
  }

  async setStatus(userId: string, status: 'active' | 'suspended' | 'banned') {
    return this.db
      .updateTable('users')
      .set({ status, updated_at: new Date() as any })
      .where('id', '=', userId)
      .returning(['id', 'status'])
      .executeTakeFirstOrThrow();
  }

  async setRole(userId: string, roleName: string) {
    const role = await this.db
      .selectFrom('roles')
      .select('id')
      .where('name', '=', roleName)
      .executeTakeFirstOrThrow();

    return this.db
      .updateTable('users')
      .set({ role_id: role.id, updated_at: new Date() as any })
      .where('id', '=', userId)
      .returning(['id'])
      .executeTakeFirstOrThrow();
  }
}
