-- Nouveau paramètre de confidentialité : afficher ou non son statut "en
-- ligne" aux autres membres. Activé par défaut (comportement déjà en
-- place, on ne fait que rendre le choix explicite et désactivable).
UPDATE users
SET privacy_settings = privacy_settings || '{"show_online_status": true}'::jsonb
WHERE NOT (privacy_settings ? 'show_online_status');

ALTER TABLE users ALTER COLUMN privacy_settings SET DEFAULT '{
  "show_reputation": true,
  "show_report_history": true,
  "show_region": true,
  "show_real_name": false,
  "dm_permission": "everyone",
  "show_online_status": true
}';
