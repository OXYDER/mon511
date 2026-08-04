import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DatabaseModule } from './database/database.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ProblemTypesModule } from './modules/problem-types/problem-types.module';
import { RegionsModule } from './modules/regions/regions.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MunicipalityIntegrationsModule } from './modules/municipality-integrations/municipality-integrations.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    DatabaseModule,
    AuthModule,
    UsersModule,
    ReportsModule,
    ProblemTypesModule,
    RegionsModule,
    ModerationModule,
    NotificationsModule,
    MunicipalityIntegrationsModule,
  ],
})
export class AppModule {}
