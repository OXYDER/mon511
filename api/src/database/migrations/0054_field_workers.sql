-- Employés de voirie assignables — simple liste de noms par
-- municipalité, SANS exiger un vrai compte au portail (contrairement
-- aux membres d'équipe existants). Sert uniquement à peupler les
-- listes déroulantes d'assignation (signalements, bons de travail).
CREATE TABLE municipal_field_workers (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id uuid NOT NULL REFERENCES regions(id),
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_municipal_field_workers_region ON municipal_field_workers(region_id);
