import { Inject, Injectable, Logger } from '@nestjs/common';
import { Kysely, sql } from 'kysely';
import { Database } from '../../database/schema';
import { KYSELY_INSTANCE } from '../../database/database.module';

@Injectable()
export class ExternalDataService {
  private readonly logger = new Logger(ExternalDataService.name);

  constructor(@Inject(KYSELY_INSTANCE) private readonly db: Kysely<Database>) {}

  /**
   * Couche officielle "à la volonté de l'usager" — le client décide de
   * l'afficher ou non, jamais mélangée avec `reports` (§ discussion sur
   * la couche MTMD distincte). On exclut les entités `is_stale` (absentes
   * du dernier sync, donc probablement terminées/résolues côté source).
   */
  async findNearby(lat: number, lng: number, radiusMeters = 15000) {
    return this.db
      .selectFrom('external_incidents')
      .innerJoin('external_data_sources', 'external_data_sources.id', 'external_incidents.source_id')
      .select([
        'external_incidents.id', 'external_incidents.title', 'external_incidents.description',
        'external_incidents.category', 'external_incidents.last_seen_at', 'external_incidents.raw_geometry',
        'external_data_sources.name as sourceName', 'external_data_sources.provider',
        'external_data_sources.feed_key as feedKey',
        sql<number>`ST_X(external_incidents.location::geometry)`.as('longitude'),
        sql<number>`ST_Y(external_incidents.location::geometry)`.as('latitude'),
        sql<string | null>`external_incidents.raw_data->>'debut'`.as('debut'),
        sql<string | null>`external_incidents.raw_data->>'fin'`.as('fin'),
        sql<string | null>`external_incidents.raw_data->>'CodeCouleurEtatChaussee'`.as('roadConditionColorCode'),
      ])
      .where('external_incidents.is_stale', '=', false)
      .where('external_incidents.location', 'is not', null)
      .where(
        sql<boolean>`ST_DWithin(external_incidents.location::geography, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusMeters})`,
      )
      .where('external_data_sources.active', '=', true)
      .limit(500)
      .execute();
  }

  async listSources() {
    return this.db.selectFrom('external_data_sources').selectAll().execute();
  }

  async findIncidentById(id: string) {
    return this.db
      .selectFrom('external_incidents')
      .innerJoin('external_data_sources', 'external_data_sources.id', 'external_incidents.source_id')
      .select([
        'external_incidents.id', 'external_incidents.title', 'external_incidents.description',
        'external_incidents.category', 'external_incidents.raw_data', 'external_incidents.last_seen_at',
        'external_data_sources.name as sourceName', 'external_data_sources.provider',
        'external_data_sources.license_note as licenseNote',
      ])
      .where('external_incidents.id', '=', id)
      .executeTakeFirst();
  }

  /**
   * Synchronise une source GeoJSON. Simplification assumée pour ce premier
   * déploiement (voir README) : déclenché manuellement via l'endpoint admin
   * plutôt que par un vrai cron — à automatiser avec @Cron() ou BullMQ une
   * fois le reste stabilisé.
   */
  async syncSource(feedKey: string) {
    const source = await this.db
      .selectFrom('external_data_sources')
      .selectAll()
      .where('feed_key', '=', feedKey)
      .executeTakeFirst();

    if (!source) return { synced: false, reason: 'source introuvable' };
    if (source.format !== 'geojson') {
      return { synced: false, reason: `format ${source.format} non supporté par ce parseur pour l'instant` };
    }

    try {
      const res = await fetch(source.feed_url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const geojson = (await res.json()) as { features: any[] };

      const seenExternalIds: string[] = [];

      for (const feature of geojson.features ?? []) {
        const externalId = String(
          feature.id ?? feature.properties?.id ?? feature.properties?.OBJECTID ?? JSON.stringify(feature.properties),
        );
        seenExternalIds.push(externalId);

        const centroid = this.computeCentroid(feature.geometry);
        const props = feature.properties ?? {};
        // Champs différents selon le flux — on essaie plusieurs candidats
        // connus plutôt qu'un seul nom générique (qui retombait toujours
        // sur le nom de la source faute de correspondance).
        const title =
          props.identificationDesTravaux ?? props.localisation ?? props.NomRoute ?? props.description ?? props.nom ?? source.name;
        const description = props.descriptionFrancais ?? props.DescriptionEtatChausseeFR ?? null;

        await this.db
          .insertInto('external_incidents')
          .values({
            source_id: source.id,
            external_id: externalId,
            location: centroid
              ? (sql`ST_SetSRID(ST_MakePoint(${centroid[0]}, ${centroid[1]}), 4326)` as any)
              : null,
            raw_geometry: feature.geometry ?? null,
            title,
            description,
            category: source.feed_key,
            raw_data: props,
            last_seen_at: new Date() as any,
            is_stale: false,
          })
          .onConflict((oc) =>
            oc.columns(['source_id', 'external_id']).doUpdateSet({
              last_seen_at: new Date() as any,
              is_stale: false,
              raw_data: props,
              title,
              description,
              raw_geometry: feature.geometry ?? null,
            }),
          )
          .execute();
      }

      // Tout ce qui n'est plus dans le flux est marqué comme périmé plutôt
      // que supprimé — garde l'historique sans polluer la couche active.
      if (seenExternalIds.length > 0) {
        await this.db
          .updateTable('external_incidents')
          .set({ is_stale: true })
          .where('source_id', '=', source.id)
          .where('external_id', 'not in', seenExternalIds)
          .execute();
      }

      await this.db
        .updateTable('external_data_sources')
        .set({ last_synced_at: new Date() as any, last_sync_status: 'ok', last_sync_error: null })
        .where('id', '=', source.id)
        .execute();

      return { synced: true, count: seenExternalIds.length };
    } catch (error) {
      this.logger.error(`Échec de synchronisation pour ${feedKey}`, error as Error);
      await this.db
        .updateTable('external_data_sources')
        .set({ last_sync_status: 'error', last_sync_error: String(error) })
        .where('id', '=', source.id)
        .execute();
      return { synced: false, reason: String(error) };
    }
  }

  /** Centroïde approximatif — suffisant pour placer un pin, pas pour un rendu de tracé précis. */
  private computeCentroid(geometry: any): [number, number] | null {
    if (!geometry) return null;
    const flatten = (coords: any): number[][] => {
      if (typeof coords[0] === 'number') return [coords];
      return coords.flatMap(flatten);
    };
    const points = flatten(geometry.coordinates);
    if (points.length === 0) return null;
    const [sumX, sumY] = points.reduce(([ax, ay]: number[], [x, y]: number[]) => [ax + x, ay + y], [0, 0]);
    return [sumX / points.length, sumY / points.length];
  }
}
