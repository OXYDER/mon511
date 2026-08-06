-- Flux officiel du gouvernement du Québec (Système d'information touristique
-- Québec), pas une source commerciale comme erabledici.ca. Inclut plusieurs
-- types de commerces agrotouristiques (cabanes à sucre, vignobles, cidreries,
-- fromageries...) — on filtrera précisément sur "cabane à sucre" une fois
-- qu'on aura vu les vrais noms de champs après une première synchronisation,
-- même approche que pour les sources MTQ/SOPFEU précédentes.

INSERT INTO external_data_sources (name, provider, feed_key, feed_url, format, license_note, sync_frequency_minutes) VALUES
  (
    'Agrotourisme (dont cabanes à sucre)',
    'SIT Québec',
    'sit_agrotourisme',
    'https://api-v3.tourinsoft.com/api/syndications/mto.tourinsoft.com/7935bf50-5173-44fc-a87e-922c80037c60?format=json',
    'json',
    'Système d''information touristique Québec (SIT Québec), via Données Québec — aperçu de l''offre touristique, pas un inventaire complet.',
    10080
  );
