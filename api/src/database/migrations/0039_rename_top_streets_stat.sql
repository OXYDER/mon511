-- Renomme la clé de statistique top_streets en problematic_zones dans
-- les paramètres déjà enregistrés — sans cette migration, une
-- municipalité qui avait déjà activé cette statistique la perdrait
-- silencieusement (la nouvelle clé ne correspondrait plus à rien dans
-- son enabled_stats existant).
UPDATE municipality_report_settings
SET enabled_stats = (
  SELECT jsonb_agg(CASE WHEN elem = '"top_streets"' THEN '"problematic_zones"'::jsonb ELSE elem END)
  FROM jsonb_array_elements(enabled_stats) AS elem
)
WHERE enabled_stats @> '["top_streets"]';
