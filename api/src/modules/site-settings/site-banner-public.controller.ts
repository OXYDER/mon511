import { Controller, Get } from '@nestjs/common';
import { SiteSettingsService } from './site-settings.service';

/** Séparé du contrôleur admin (qui exige une connexion + un rôle) — la
 * bannière doit être lisible par tout le monde, y compris les visiteurs
 * anonymes qui n'ont jamais créé de compte. */
@Controller('public/site-banner')
export class SiteBannerPublicController {
  constructor(private readonly service: SiteSettingsService) {}

  @Get()
  async getBanner() {
    const setting = await this.service.findOne('site_banner');
    return setting?.value ?? { enabled: false };
  }
}
