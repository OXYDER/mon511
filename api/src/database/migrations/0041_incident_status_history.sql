-- Vrai historique des changements de statut d'un incident — jusqu'ici,
-- report_municipal_tracking ne gardait que l'état ACTUEL, jamais les
-- changements précédents. Chaque ligne ici est un événement conservé
-- pour toujours, jamais écrasé.
CREATE TABLE incident_status_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  -- groupKey (incident_id ou report_id si jamais rattaché à un
  -- incident) — même logique COALESCE déjà utilisée partout ailleurs
  -- pour identifier un groupe, texte plutôt que uuid pour accepter les
  -- deux cas sans complexité additionnelle.
  group_key text NOT NULL,
  region_id uuid NOT NULL REFERENCES regions(id),
  internal_status text NOT NULL CHECK (internal_status IN ('new', 'acknowledged', 'in_progress', 'done')),
  -- Note optionnelle du changement — visible aux citoyens si
  -- visible_to_public est vrai (ex. "Réparation prévue mardi
  -- prochain"), jamais visible sinon (ex. notes purement internes).
  note text,
  visible_to_public boolean NOT NULL DEFAULT false,
  changed_by uuid REFERENCES users(id),
  changed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_incident_status_history_group ON incident_status_history(group_key);
CREATE INDEX idx_incident_status_history_region ON incident_status_history(region_id);
