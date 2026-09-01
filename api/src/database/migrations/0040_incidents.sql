-- Un incident représente UN problème physique réel (ex. un nid-de-poule
-- précis) qui peut recevoir plusieurs signalements citoyens distincts.
-- Chaque signalement individuel reste intact dans `reports` — un
-- incident ne fait que les regrouper pour que le portail municipal
-- travaille sur "un problème", pas "8 tickets identiques".
CREATE TABLE incidents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id uuid REFERENCES regions(id),
  problem_type_id uuid NOT NULL REFERENCES problem_types(id),
  -- Position du tout premier signalement de cet incident — sert de
  -- référence pour le regroupement géographique des signalements
  -- suivants, jamais recalculée en centroïde mobile (plus simple, et
  -- suffisant vu le rayon de regroupement volontairement serré — voir
  -- reports.service.ts).
  location geometry(Point, 4326) NOT NULL,
  first_reported_at timestamptz NOT NULL DEFAULT now(),
  last_reported_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_incidents_region ON incidents(region_id);
CREATE INDEX idx_incidents_type ON incidents(problem_type_id);
CREATE INDEX idx_incidents_location ON incidents USING GIST(location);

ALTER TABLE reports ADD COLUMN IF NOT EXISTS incident_id uuid REFERENCES incidents(id);
CREATE INDEX IF NOT EXISTS idx_reports_incident ON reports(incident_id);
