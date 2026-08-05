import { Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';

@Injectable()
export class SiteSettingsService {
  constructor(@Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>) {}

  async findAll() {
    return this.db.selectFrom('site_settings').selectAll().orderBy('key').execute();
  }

  async update(key: string, value: unknown, updatedBy: string) {
    return this.db
      .updateTable('site_settings')
      .set({ value: value as any, updated_at: new Date() as any, updated_by: updatedBy })
      .where('key', '=', key)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}
