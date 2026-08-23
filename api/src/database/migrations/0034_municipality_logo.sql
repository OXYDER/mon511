-- Logo d'une municipalité, stocké sur le même espace MinIO que les
-- photos de signalements (voir uploads.service.ts) — null tant qu'aucun
-- logo n'a été téléversé, la municipalité s'affiche alors avec une
-- icône générique.
ALTER TABLE regions ADD COLUMN IF NOT EXISTS logo_url text;
