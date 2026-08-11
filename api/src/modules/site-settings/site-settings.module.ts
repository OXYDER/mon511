import { Module } from '@nestjs/common';
import { SiteSettingsController } from './site-settings.controller';
import { SiteBannerPublicController } from './site-banner-public.controller';
import { SiteSettingsService } from './site-settings.service';

@Module({
  controllers: [SiteSettingsController, SiteBannerPublicController],
  providers: [SiteSettingsService],
})
export class SiteSettingsModule {}
