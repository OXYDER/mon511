-- Bornes de recharge électrique — deux sources complémentaires :
--
-- 1. OpenChargeMap : couverture de tout le Québec, via une boîte
--    englobante (nord-ouest à sud-est) plutôt qu'un simple pays — le
--    paramètre "statelevel" utilisé dans une version précédente de
--    cette migration N'EXISTE PAS dans leur vraie API (vérifié contre
--    leur documentation officielle après coup), ce qui faisait échouer
--    silencieusement le filtrage par province.
-- 2. Données Québec / Ville de Montréal : gratuite, aucune clé requise,
--    mais couvre SEULEMENT le territoire de Montréal (voir métadonnées du
--    jeu de données) — un bon complément officiel, pas un remplacement.
INSERT INTO external_data_sources (name, provider, feed_key, feed_url, format, license_note, sync_frequency_minutes, active) VALUES
  (
    'Bornes de recharge (OpenChargeMap)', 'OpenChargeMap', 'openchargemap_qc',
    'https://api.openchargemap.io/v3/poi/?output=json&countrycode=CA&boundingbox=%2862.6%2C-79.8%29%2C%2845.0%2C-57.1%29&maxresults=8000&compact=false&verbose=false&key=34cc3c8e-85c2-4639-bd0c-2e74827519c2',
    'json', 'OpenChargeMap — licence ouverte, voir openchargemap.org/site/developerinfo', 240, true
  ),
  (
    'Bornes de recharge publiques (Montréal)', 'Ville de Montréal / Données Québec', 'bornes_recharge_montreal',
    'https://donnees.montreal.ca/dataset/c999d1a9-8333-4871-9226-7d3a53f490a6/resource/98ef3ed6-56ca-4d5e-a213-fd72066b18b5/download/bornes-recharge-publiques.csv',
    'csv', 'Ville de Montréal — Licence Creative Commons 4.0 Attribution (CC-BY), territoire de Montréal seulement', 1440, true
  )
ON CONFLICT (feed_key) DO NOTHING;
