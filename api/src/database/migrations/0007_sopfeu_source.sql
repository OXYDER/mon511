-- L'API SOPFEU n'est pas du GeoJSON WFS comme les flux MTQ — c'est une API
-- REST classique qui retourne un tableau JSON. On ajoute donc un format
-- 'json' distinct, avec un parseur dédié dans external-data.service.ts.

ALTER TYPE external_feed_format ADD VALUE IF NOT EXISTS 'json';

INSERT INTO external_data_sources (name, provider, feed_key, feed_url, format, license_note, sync_frequency_minutes) VALUES
  (
    'Feux de forêt actifs',
    'SOPFEU',
    'sopfeu_feux_actifs',
    'https://geofeux.sopfeu.qc.ca/sopfeu-api/public/feux?conditions=0,1,2,3,4,5&intensive=true&nordique=true',
    'json',
    'API publique SOPFEU (geofeux.sopfeu.qc.ca) — conditions 0 à 5 = feux actifs (recensé à maîtrisé), 6 exclu = feux éteints.',
    15
  );
