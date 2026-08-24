-- Corrige l'URL de la source openchargemap_qc insérée par la migration
-- 0035 — celle-ci utilisait un paramètre "statelevel" qui n'existe tout
-- simplement pas dans la vraie API OpenChargeMap (vérifié après coup
-- contre leur documentation officielle), ce qui empêchait tout
-- filtrage réel par province et faisait échouer silencieusement le
-- ciblage du Québec. Remplacé par une boîte englobante (nord-ouest à
-- sud-est) couvrant tout le territoire québécois.
UPDATE external_data_sources
SET feed_url = 'https://api.openchargemap.io/v3/poi/?output=json&countrycode=CA&boundingbox=%2862.6%2C-79.8%29%2C%2845.0%2C-57.1%29&maxresults=8000&compact=false&verbose=false&key=34cc3c8e-85c2-4639-bd0c-2e74827519c2'
WHERE feed_key = 'openchargemap_qc';
