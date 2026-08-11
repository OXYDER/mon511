import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { renderReportInfoCard } from '../../email/email-template';

/** Données d'exemple utilisées pour la prévisualisation dans l'admin —
 * un gabarit avec toutes ses variables réalistes, sans jamais envoyer de
 * vrai courriel ni toucher à de vraies données. */
const SAMPLE_VALUES: Record<string, string> = {
  firstName: 'Marie',
  code: '482913',
  expiryMinutes: '15',
  newEmail: 'marie.exemple@courriel.ca',
  reportType: 'Nid-de-poule',
  reportDate: '11 août 2026',
  reportStatus: 'En attente de modération',
  reportAddress: '1351 Route 116, Danville, Québec J0A 1A0',
  reportMunicipality: 'Danville',
  reportPhotoUrl: '',
  reportUrl: 'https://mon511.ca/?report=exemple',
  reporterName: 'Marie L.',
  rejectReason: "La photo ne montre pas clairement l'emplacement du problème.",
  correctionDays: '7',
  warningDays: '30',
  deadlineDays: '15',
};

@Injectable()
export class EmailTemplatesService {
  constructor(@Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>) {}

  async findAll() {
    return this.db.selectFrom('email_templates').selectAll().orderBy('key').execute();
  }

  async findOne(key: string) {
    const template = await this.db.selectFrom('email_templates').selectAll().where('key', '=', key).executeTakeFirst();
    if (!template) throw new NotFoundException(`Gabarit '${key}' introuvable.`);
    return template;
  }

  async update(key: string, changes: { subject?: string; bodyHtml?: string }, updatedBy?: string) {
    await this.findOne(key); // 404 clair si la clé n'existe pas
    await this.db
      .updateTable('email_templates')
      .set({
        ...(changes.subject !== undefined && { subject: changes.subject }),
        ...(changes.bodyHtml !== undefined && { body_html: changes.bodyHtml }),
        updated_at: new Date() as any,
        ...(updatedBy && { updated_by: updatedBy }),
      })
      .where('key', '=', key)
      .execute();
    return this.findOne(key);
  }

  /** Remplace {{variable}} par sa valeur dans un texte — variables non
   * fournies remplacées par une chaîne vide plutôt que laissées telles
   * quelles (évite d'exposer '{{xyz}}' brut si jamais un appelant oublie
   * une variable). */
  private substitute(text: string, variables: Record<string, string | undefined>): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_, name) => variables[name] ?? '');
  }

  /** Construit le rendu final (sujet + corps HTML) d'un gabarit avec de
   * vraies variables — utilisé au moment de l'envoi. La variable spéciale
   * {{reportInfoCard}} est calculée automatiquement à partir des champs
   * report* fournis plutôt que d'être une simple substitution de texte. */
  async render(key: string, variables: Record<string, string | undefined>) {
    const template = await this.findOne(key);
    const withInfoCard = { ...variables, reportInfoCard: this.buildReportInfoCard(variables) };
    return {
      subject: this.substitute(template.subject, withInfoCard),
      bodyHtml: this.substitute(template.body_html, withInfoCard),
    };
  }

  /** Prévisualisation avec des données d'exemple — pour l'admin, ne touche
   * jamais à de vraies données ni n'envoie quoi que ce soit. */
  async preview(key: string) {
    const template = await this.findOne(key);
    const withInfoCard = { ...SAMPLE_VALUES, reportInfoCard: this.buildReportInfoCard(SAMPLE_VALUES) };
    return {
      subject: this.substitute(template.subject, withInfoCard),
      bodyHtml: this.substitute(template.body_html, withInfoCard),
    };
  }

  private buildReportInfoCard(v: Record<string, string | undefined>): string {
    if (!v.reportType && !v.reportAddress) return '';
    const fields = [
      { label: 'Type', value: v.reportType ?? '' },
      { label: 'Date', value: v.reportDate ?? '' },
      { label: 'Statut', value: v.reportStatus ?? '' },
      { label: 'Position', value: v.reportAddress ?? '' },
      { label: 'Municipalité', value: v.reportMunicipality ?? '' },
      { label: 'Signalé par', value: v.reporterName ?? '' },
    ];
    return renderReportInfoCard(fields, v.reportPhotoUrl || null);
  }
}
