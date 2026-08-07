-- Le nom seul ne suffit pas comme clé de correspondance : 58 municipalités
-- du répertoire du MAMH partagent leur nom avec une autre entité (souvent
-- un village nordique et son pendant "terres de la catégorie" distinct).
-- On ajoute donc le vrai code source à regions aussi, pas seulement à
-- municipality_integrations, pour faire le lien de façon fiable.
ALTER TABLE regions ADD COLUMN source_mcode text UNIQUE;

ALTER TABLE municipality_integrations
  ADD COLUMN contact_phone text,
  ADD COLUMN contact_website text,
  ADD COLUMN mailing_address text,
  ADD COLUMN postal_code text,
  ADD COLUMN mrc_name text,
  ADD COLUMN population integer,
  ADD COLUMN source_mcode text; -- code du Répertoire des municipalités du MAMH, pour resynchroniser plus tard

CREATE UNIQUE INDEX IF NOT EXISTS idx_municipality_integrations_source_mcode ON municipality_integrations (source_mcode);
