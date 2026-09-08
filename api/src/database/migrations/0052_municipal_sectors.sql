-- Secteurs municipaux — associe automatiquement un incident à un
-- secteur selon des mots-clés dans son adresse (ex. "Boulevard
-- Industriel" -> Secteur Nord). Approche par mots-clés plutôt que
-- polygones géographiques dessinés sur la carte — plus simple à
-- livrer de façon fiable, et suffisant pour comparer volume/
-- performance entre secteurs comme demandé.
CREATE TABLE municipal_sectors (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id uuid NOT NULL REFERENCES regions(id),
  name text NOT NULL,
  color text NOT NULL DEFAULT '#FF5A1F',
  street_keywords text[] NOT NULL DEFAULT '{}', -- un incident correspond si son adresse contient AU MOINS UN de ces mots-clés
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_municipal_sectors_region ON municipal_sectors(region_id);

ALTER TABLE incidents ADD COLUMN IF NOT EXISTS sector_id uuid REFERENCES municipal_sectors(id);
