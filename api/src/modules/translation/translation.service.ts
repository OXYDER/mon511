import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class TranslationService {
  private readonly logger = new Logger(TranslationService.name);

  constructor(private readonly config: ConfigService) {}

  /** Traduit un texte via l'instance LibreTranslate auto-hébergée
   * (LIBRETRANSLATE_URL, ex. http://192.168.0.252:5050) — un service
   * ouvert et gratuit, mais moins précis que DeepL/Google, choisi
   * délibérément pour éviter toute dépendance externe payante. */
  async translate(text: string, sourceLang: 'fr' | 'en', targetLang: 'fr' | 'en'): Promise<string> {
    const baseUrl = this.config.get<string>('LIBRETRANSLATE_URL');
    if (!baseUrl) {
      throw new BadGatewayException('Le service de traduction n\'est pas configuré.');
    }

    try {
      const response = await fetch(`${baseUrl.replace(/\/$/, '')}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: text, source: sourceLang, target: targetLang, format: 'text' }),
        // Court délai — une traduction qui traîne ne doit jamais bloquer
        // longtemps l'affichage d'un signalement pour l'usager.
        signal: AbortSignal.timeout(8000),
      });

      if (!response.ok) {
        throw new Error(`LibreTranslate a répondu ${response.status}`);
      }

      const data = await response.json();
      return data.translatedText as string;
    } catch (err) {
      this.logger.warn(`Échec de traduction : ${err instanceof Error ? err.message : err}`);
      throw new BadGatewayException('La traduction a échoué. Réessaie plus tard.');
    }
  }
}
