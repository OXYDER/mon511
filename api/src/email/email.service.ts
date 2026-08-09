import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { renderEmailHtml } from './email-template';

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {
    const host = this.config.get<string>('SMTP_HOST');
    if (host) {
      this.transporter = nodemailer.createTransport({
        host,
        port: Number(this.config.get('SMTP_PORT') ?? 587),
        auth: {
          user: this.config.get('SMTP_USER'),
          pass: this.config.get('SMTP_PASSWORD'),
        },
      });
    }
  }

  /**
   * Si aucun SMTP n'est configuré (variables d'environnement absentes),
   * le courriel est simplement journalisé plutôt que de faire échouer la
   * requête — pratique pour tester le reste de l'application sans avoir
   * de vraies identifiants SMTP dès le départ.
   *
   * Si le SMTP EST configuré mais que l'envoi échoue (mauvais identifiants,
   * serveur injoignable, etc.), on journalise le détail technique complet
   * côté serveur (pour diagnostiquer), mais on lance une erreur claire côté
   * usager plutôt que de laisser fuir un 'Internal server error' opaque.
   */
  async send(to: string, subject: string, body: string, options?: { ctaLabel?: string; ctaUrl?: string }) {
    if (!this.transporter) {
      this.logger.warn(`SMTP non configuré — courriel simulé à ${to} : "${subject}"`);
      return { simulated: true };
    }

    // Le texte brut envoyé par les appelants est transformé en paragraphes
    // HTML simples pour habiller le gabarit de marque, tout en gardant le
    // texte original comme repli pour les clients courriel qui n'affichent
    // pas le HTML.
    const bodyHtml = body
      .split('\n\n')
      .map((p) => `<p style="margin:0 0 12px;">${p.replace(/\n/g, '<br />')}</p>`)
      .join('');

    const html = renderEmailHtml({ title: subject, bodyHtml, ctaLabel: options?.ctaLabel, ctaUrl: options?.ctaUrl });

    try {
      await this.transporter.sendMail({
        from: this.config.get('EMAIL_FROM') ?? 'notifications@mon511.ca',
        to,
        subject,
        text: body,
        html,
      });
      return { simulated: false };
    } catch (error) {
      this.logger.error(`Échec d'envoi du courriel à ${to} ("${subject}")`, error as Error);
      throw new ServiceUnavailableException(
        "Impossible d'envoyer le courriel pour l'instant — réessaie dans quelques minutes. Si le problème persiste, contacte-nous à info@mon511.ca.",
      );
    }
  }
}
