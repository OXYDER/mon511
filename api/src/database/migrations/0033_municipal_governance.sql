-- Permet de rattacher une publication à une municipalité (par défaut,
-- celle de son auteur, fixée à la création) — nécessaire pour que le
-- futur gestionnaire municipal puisse modérer les publications propres à
-- SA municipalité, en plus des signalements.
ALTER TABLE posts ADD COLUMN IF NOT EXISTS region_id uuid REFERENCES regions(id);
CREATE INDEX IF NOT EXISTS idx_posts_region ON posts(region_id);
