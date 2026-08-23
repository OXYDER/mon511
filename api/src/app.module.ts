import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { DatabaseModule } from './database/database.module';
import { EmailModule } from './email/email.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health.controller';
import { UsersModule } from './modules/users/users.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ProblemTypesModule } from './modules/problem-types/problem-types.module';
import { RegionsModule } from './modules/regions/regions.module';
import { ModerationModule } from './modules/moderation/moderation.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { MunicipalityIntegrationsModule } from './modules/municipality-integrations/municipality-integrations.module';
import { CommentsModule } from './modules/comments/comments.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { UploadsModule } from './modules/uploads/uploads.module';
import { ExternalDataModule } from './modules/external-data/external-data.module';
import { SiteSettingsModule } from './modules/site-settings/site-settings.module';
import { ReputationModule } from './modules/reputation/reputation.module';
import { VerificationModule } from './verification/verification.module';
import { LifecycleModule } from './modules/lifecycle/lifecycle.module';
import { MunicipalPortalModule } from './modules/municipal-portal/municipal-portal.module';
import { FriendsModule } from './modules/friends/friends.module';
import { PostsModule } from './modules/posts/posts.module';
import { TranslationModule } from './modules/translation/translation.module';
import { SupportModule } from './modules/support/support.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    DatabaseModule,
    EmailModule,
    AuthModule,
    UsersModule,
    ReportsModule,
    ProblemTypesModule,
    RegionsModule,
    ModerationModule,
    NotificationsModule,
    MunicipalityIntegrationsModule,
    CommentsModule,
    MessagingModule,
    UploadsModule,
    ExternalDataModule,
    SiteSettingsModule,
    ReputationModule,
    VerificationModule,
    LifecycleModule,
    MunicipalPortalModule,
    FriendsModule,
    PostsModule,
    TranslationModule,
    SupportModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
