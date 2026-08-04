import { Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { UpsertMunicipalityIntegrationDto } from './dto/upsert-municipality-integration.dto';
import { EmailService } from '../../email/email.service';

@Injectable()
export class MunicipalityIntegrationsService {
  constructor(
    @Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>,
    private readonly emailService: EmailService,
  ) {}

  async findAll() {
    return this.db
      .selectFrom('municipality_integrations')
      .innerJoin('regions', 'regions.id', 'municipality_integrations.region_id')
      .select([
        'municipality_integrations.id', 'municipality_integrations.auto_send_enabled',
        'municipality_integrations.contact_email', 'regions.name_fr as regionNameFr',
      ])
      .execute();
  }

  async upsert(dto: UpsertMunicipalityIntegrationDto, updatedBy: string) {
    const existing = await this.db
      .selectFrom('municipality_integrations')
      .select('id')
      .where('region_id', '=', dto.regionId)
      .executeTakeFirst();

    const values = {
      region_id: dto.regionId,
      auto_send_enabled: dto.autoSendEnabled,
      contact_email: dto.contactEmail ?? null,
      email_subject_template: dto.emailSubjectTemplate ?? null,
      email_body_template: dto.emailBodyTemplate ?? null,
      notify_category_ids: dto.notifyCategoryIds ?? null,
      updated_by: updatedBy,
    };

    if (existing) {
      return this.db
        .updateTable('municipality_integrations')
        .set({ ...values, updated_at: new Date() as any })
        .where('id', '=', existing.id)
        .returningAll()
        .executeTakeFirstOrThrow();
    }

    return this.db
      .insertInto('municipality_integrations')
      .values(values)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  /**
   * Interpole le gabarit d'un courriel pour une municipalité — utilise le
   * gabarit spécifique s'il existe, sinon retombe sur le gabarit global
   * (site_settings.default_municipality_email_*). Voir modèle de données §16.
   */
  async renderEmail(regionId: string, variables: Record<string, string>) {
    const integration = await this.db
      .selectFrom('municipality_integrations')
      .select(['email_subject_template', 'email_body_template'])
      .where('region_id', '=', regionId)
      .executeTakeFirst();

    const defaults = await this.db
      .selectFrom('site_settings')
      .select(['key', 'value'])
      .where('key', 'in', ['default_municipality_email_subject', 'default_municipality_email_template'])
      .execute();

    const defaultSubject = defaults.find((d) => d.key === 'default_municipality_email_subject')?.value as string;
    const defaultBody = defaults.find((d) => d.key === 'default_municipality_email_template')?.value as string;

    const subjectTemplate = integration?.email_subject_template ?? defaultSubject ?? '';
    const bodyTemplate = integration?.email_body_template ?? defaultBody ?? '';

    const interpolate = (template: string) =>
      template.replace(/{{(\w+)}}/g, (_, key) => variables[key] ?? '');

    return { subject: interpolate(subjectTemplate), body: interpolate(bodyTemplate) };
  }

  /**
   * Envoi réel à la municipalité concernée, appelé après publication d'un
   * signalement (voir moderation.service.ts). Simplification pour ce
   * premier déploiement : exécuté de façon synchrone dans la requête plutôt
   * que via un worker BullMQ séparé — à migrer vers une vraie file d'attente
   * si le volume grandit, sans changer la logique métier ici.
   */
  async notifyMunicipality(reportId: string) {
    const report = await this.db
      .selectFrom('reports')
      .innerJoin('problem_types', 'problem_types.id', 'reports.problem_type_id')
      .select([
        'reports.id', 'reports.region_id', 'reports.description', 'reports.address_text',
        'reports.created_at', 'problem_types.name_fr as problemTypeName',
      ])
      .where('reports.id', '=', reportId)
      .executeTakeFirst();

    if (!report || !report.region_id) return { sent: false, reason: 'aucune région dérivée' };

    const integration = await this.db
      .selectFrom('municipality_integrations')
      .selectAll()
      .where('region_id', '=', report.region_id)
      .where('auto_send_enabled', '=', true)
      .executeTakeFirst();

    if (!integration || !integration.contact_email) {
      return { sent: false, reason: 'intégration non configurée pour cette municipalité' };
    }

    const region = await this.db
      .selectFrom('regions')
      .select('name_fr')
      .where('id', '=', report.region_id)
      .executeTakeFirstOrThrow();

    const { subject, body } = await this.renderEmail(report.region_id, {
      problem_type: report.problemTypeName,
      description: report.description ?? '',
      address: report.address_text ?? '',
      municipality_name: region.name_fr,
      reported_at: report.created_at.toString(),
      report_url: `https://mon511.ca/r/${report.id}`,
    });

    const notification = await this.db
      .insertInto('report_notifications')
      .values({ report_id: reportId, region_id: report.region_id, method: 'email', status: 'pending' })
      .returning('id')
      .executeTakeFirstOrThrow();

    try {
      await this.emailService.send(integration.contact_email, subject, body);
      await this.db
        .updateTable('report_notifications')
        .set({ status: 'sent', sent_at: new Date() as any })
        .where('id', '=', notification.id)
        .execute();
      return { sent: true };
    } catch (error) {
      await this.db
        .updateTable('report_notifications')
        .set({ status: 'failed', error_message: String(error) })
        .where('id', '=', notification.id)
        .execute();
      return { sent: false, reason: 'échec envoi courriel' };
    }
  }
}
