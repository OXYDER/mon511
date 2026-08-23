import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { TranslationService } from './translation.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';

@Controller('translation')
@UseGuards(JwtAuthGuard)
export class TranslationController {
  constructor(private readonly service: TranslationService) {}

  @Post('translate')
  translate(@Body() body: { text: string; source: 'fr' | 'en'; target: 'fr' | 'en' }) {
    return this.service.translate(body.text, body.source, body.target).then((translatedText) => ({ translatedText }));
  }
}
