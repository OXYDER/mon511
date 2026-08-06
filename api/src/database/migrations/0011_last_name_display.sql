-- Ajoute la clé aux comptes existants (sans écraser leurs autres réglages).
UPDATE users
SET privacy_settings = privacy_settings || '{"last_name_display": "hidden"}'::jsonb
WHERE NOT (privacy_settings ? 'last_name_display');

ALTER TABLE users
  ALTER COLUMN privacy_settings SET DEFAULT '{
    "show_reputation": true,
    "show_report_history": true,
    "show_region": true,
    "show_real_name": false,
    "last_name_display": "hidden",
    "dm_permission": "everyone"
  }';
