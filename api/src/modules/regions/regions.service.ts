import { Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';

@Injectable()
export class RegionsService {
  constructor(@Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>) {}

  /** Régions déployées publiquement — alimente les filtres de la carte client. */
  async findActive() {
    return this.db
      .selectFrom('regions')
      .select(['id', 'parent_id', 'type', 'name_fr', 'name_en', 'deployment_status'])
      .where('deployment_status', 'in', ['active', 'partial'])
      .execute();
  }

  /** Toutes les régions, tous statuts — écran admin "Régions & zones". */
  async findAllForAdmin() {
    return this.db
      .selectFrom('regions')
      .selectAll()
      .orderBy('type')
      .orderBy('name_fr')
      .execute();
  }

  async updateDeploymentStatus(id: string, status: 'active' | 'partial' | 'inactive') {
    return this.db
      .updateTable('regions')
      .set({ deployment_status: status })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
