-- Couche de données officielles externes (ex. MTMD) — volontairement séparée
-- de `reports` : ce ne sont pas des signalements communautaires, donc elles
-- ne touchent ni la réputation, ni la modération, ni le fil de discussion.
-- L'utilisateur active/désactive cette couche à sa volonté côté client.

CREATE TYPE external_feed_format AS ENUM ('geojson', 'csv');

CREATE TABLE external_data_sources (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL,
  provider text NOT NULL,             -- ex. 'MTMD'
  feed_key text NOT NULL UNIQUE,       -- identifiant stable utilisé par le job de sync, ex. 'mtmd_travaux_routiers'
  feed_url text NOT NULL,
  format external_feed_format NOT NULL DEFAULT 'geojson',
  license_note text,
  sync_frequency_minutes integer NOT NULL DEFAULT 30,
  last_synced_at timestamptz,
  last_sync_status text,               -- 'ok' | 'error'
  last_sync_error text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE external_incidents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id uuid NOT NULL REFERENCES external_data_sources(id) ON DELETE CASCADE,
  external_id text NOT NULL,           -- identifiant fourni par la source, pour dédupliquer aux resynchronisations
  location geometry(Point, 4326),      -- centroïde si la source fournit une ligne/polygone
  raw_geometry jsonb,                  -- géométrie brute complète (utile pour les tronçons linéaires)
  title text,
  description text,
  category text,                       -- ex. 'travaux', 'condition_hivernale' — libre, pas lié à problem_types
  raw_data jsonb NOT NULL,             -- feature GeoJSON brute, pour ne rien perdre entre les champs normalisés
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  is_stale boolean NOT NULL DEFAULT false,  -- vrai si absent du dernier sync (probablement résolu/terminé)
  UNIQUE (source_id, external_id)
);
CREATE INDEX idx_external_incidents_location ON external_incidents USING GIST(location);
CREATE INDEX idx_external_incidents_source ON external_incidents(source_id);
CREATE INDEX idx_external_incidents_stale ON external_incidents(is_stale);

INSERT INTO external_data_sources (name, provider, feed_key, feed_url, format, license_note, sync_frequency_minutes) VALUES
  (
    'Travaux routiers',
    'MTMD',
    'mtmd_travaux_routiers',
    'https://ws.mapserver.transports.gouv.qc.ca/swtq?service=wfs&version=2.0.0&request=getfeature&typename=ms:chantiers_mtmdet&outfile=TravauxRoutiers&srsname=EPSG:4326&outputformat=geojson',
    'geojson',
    'Licence Ouverte du gouvernement du Québec — vérifier les conditions exactes sur donneesquebec.ca avant usage en production.',
    30
  ),
  (
    'Conditions routières hivernales',
    'MTMD',
    'mtmd_conditions_hivernales',
    'https://ws.mapserver.transports.gouv.qc.ca/swtq?service=wfs&version=2.0.0&request=getfeature&typename=ms:conditions_routieres&outfile=CondRoutHiver_Continu&outputformat=csv',
    'csv',
    'Licence Ouverte du gouvernement du Québec — mise à jour quotidienne (3h-6h) en hiver, sur changement. Format CSV, pas GeoJSON — parseur distinct requis.',
    60
  );
