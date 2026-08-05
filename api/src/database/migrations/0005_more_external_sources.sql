-- Deux nouvelles sources officielles confirmées. Contrairement à Travaux
-- routiers et Conditions hivernales, on n'a pas encore d'échantillon réel
-- de raw_data pour celles-ci — donc pas de rendu spécialisé (statut, couleur)
-- côté client tant qu'on n'aura pas inspecté un vrai enregistrement après
-- une première synchronisation.

INSERT INTO external_data_sources (name, provider, feed_key, feed_url, format, license_note, sync_frequency_minutes) VALUES
  (
    'Avertissements routiers',
    'MTMD',
    'mtmd_avertissements',
    'https://ws.mapserver.transports.gouv.qc.ca/swtq?service=wfs&version=2.0.0&request=getfeature&typename=ms:evenements&outfile=AvertissementRoutier&srsname=EPSG:4326&outputformat=geojson',
    'geojson',
    'Licence Ouverte du gouvernement du Québec — fermetures de route/pont et incidents empêchant le passage.',
    15
  ),
  (
    'Débit de circulation',
    'MTMD',
    'mtmd_debit_circulation',
    'https://ws.mapserver.transports.gouv.qc.ca/swtq?service=wfs&version=2.0.0&request=getfeature&typename=ms:circulation_routier&outfile=DebitCirculation&srsname=EPSG:4326&outputformat=geojson',
    'geojson',
    'Licence Ouverte du gouvernement du Québec — débits estimés (DJMA/DJME/DJMH), pas de la congestion en temps réel.',
    1440
  );
