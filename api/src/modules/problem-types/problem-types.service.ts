import { Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { UpsertProblemTypeDto } from './dto/upsert-problem-type.dto';

@Injectable()
export class ProblemTypesService {
  constructor(@Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>) {}

  /** Utilisé par le formulaire de signalement client — seulement les types actifs. */
  async findAllActive() {
    return this.db
      .selectFrom('problem_types')
      .innerJoin('problem_categories', 'problem_categories.id', 'problem_types.category_id')
      .select([
        'problem_types.id', 'problem_types.name_fr', 'problem_types.name_en',
        'problem_types.icon', 'problem_types.default_severity',
        'problem_categories.name_fr as categoryNameFr',
        'problem_categories.name_en as categoryNameEn',
      ])
      .where('problem_types.active', '=', true)
      .where('problem_categories.active', '=', true)
      .orderBy('problem_categories.sort_order')
      .orderBy('problem_types.sort_order')
      .execute();
  }

  /** Utilisé par l'écran admin "Catégories & types" — inclut les inactifs. */
  async findAllForAdmin() {
    return this.db
      .selectFrom('problem_types')
      .innerJoin('problem_categories', 'problem_categories.id', 'problem_types.category_id')
      .select([
        'problem_types.id', 'problem_types.name_fr', 'problem_types.name_en',
        'problem_types.icon', 'problem_types.active',
        'problem_categories.name_fr as categoryNameFr',
      ])
      .orderBy('problem_categories.sort_order')
      .orderBy('problem_types.sort_order')
      .execute();
  }

  async create(dto: UpsertProblemTypeDto) {
    return this.db
      .insertInto('problem_types')
      .values({
        category_id: dto.categoryId,
        name_fr: dto.nameFr,
        name_en: dto.nameEn,
        icon: dto.icon ?? null,
        default_severity: dto.defaultSeverity ?? null,
        active: dto.active ?? true,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(id: string, dto: Partial<UpsertProblemTypeDto>) {
    return this.db
      .updateTable('problem_types')
      .set({
        ...(dto.categoryId && { category_id: dto.categoryId }),
        ...(dto.nameFr && { name_fr: dto.nameFr }),
        ...(dto.nameEn && { name_en: dto.nameEn }),
        ...(dto.icon !== undefined && { icon: dto.icon }),
        ...(dto.defaultSeverity !== undefined && { default_severity: dto.defaultSeverity }),
        ...(dto.active !== undefined && { active: dto.active }),
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /** Désactivation plutôt que suppression — préserve l'historique des signalements existants (§4). */
  async deactivate(id: string) {
    return this.update(id, { active: false });
  }
}
