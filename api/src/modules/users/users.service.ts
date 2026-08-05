import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { UpdatePrivacyDto } from './dto/update-privacy.dto';

@Injectable()
export class UsersService {
  constructor(@Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>) {}

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
  async findPublicProfile(id: string) {
    const user = await this.findById(id);
    const settings = user.privacy_settings;

    return {
      id: user.id,
      displayName: settings.show_real_name
        ? `${user.first_name ?? ''} ${user.last_name ?? ''}`.trim()
        : user.email.split('@')[0],
      avatarUrl: user.avatar_url,
      reputationScore: settings.show_reputation ? user.reputation_score : null,
      regionId: settings.show_region ? user.region_id : null,
      memberSince: user.created_at,
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
      .select([
        'reports.id', 'reports.status', 'reports.created_at',
        'problem_types.name_fr as problemTypeNameFr',
        'problem_types.icon as problemTypeIcon',
      ])
      .where('reports.user_id', '=', userId)
      .orderBy('reports.created_at', 'desc')
      .execute();
  }
}
