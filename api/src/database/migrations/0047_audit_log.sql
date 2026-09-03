-- Journal d'audit générique — qui a fait quoi, quand, sur quoi.
-- Volontairement générique (target_type/target_id plutôt qu'une table
-- par type d'action) pour pouvoir tracer n'importe quelle action future
-- sans nouvelle migration à chaque fois.
CREATE TABLE audit_log (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id uuid NOT NULL REFERENCES regions(id),
  actor_id uuid REFERENCES users(id), -- null si l'action vient du système (ex. calcul automatique)
  action text NOT NULL, -- ex. 'status_changed', 'priority_overridden', 'assigned', 'merged', 'permission_changed'
  target_type text NOT NULL, -- ex. 'incident', 'work_order', 'rank_permission', 'team_member'
  target_id text NOT NULL,
  details jsonb, -- contexte libre (ex. {"from": "new", "to": "in_progress"})
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_audit_log_region ON audit_log(region_id);
CREATE INDEX idx_audit_log_target ON audit_log(target_type, target_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);
