import { Inject, Injectable } from '@nestjs/common';
import { Kysely } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';
import { UpsertMunicipalityIntegrationDto } from './dto/upsert-municipality-integration.dto';

@Injectable()
export class MunicipalityIntegrationsService {
  constructor(@Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>) {}

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
}
