import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import { Database } from './schema';

export const KYSELY_INSTANCE = 'KYSELY_INSTANCE';

// Module global : injecté une fois, disponible partout sans réimporter
// dans chaque module (les requêtes géospatiales et transactions passent
// toutes par cette même instance).
@Global()
@Module({
  providers: [
    {
      provide: KYSELY_INSTANCE,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const pool = new Pool({
          connectionString: config.get<string>('DATABASE_URL'),
          max: 10,
        });
        return new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
      },
    },
  ],
  exports: [KYSELY_INSTANCE],
})
export class DatabaseModule {}
