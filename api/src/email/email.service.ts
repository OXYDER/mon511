import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

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
   */
  async send(to: string, subject: string, body: string) {
    if (!this.transporter) {
      this.logger.warn(`SMTP non configuré — courriel simulé à ${to} : "${subject}"`);
      return { simulated: true };
    }

    await this.transporter.sendMail({
      from: this.config.get('EMAIL_FROM') ?? 'notifications@mon511.ca',
      to,
      subject,
      text: body,
    });

    return { simulated: false };
  }
}
