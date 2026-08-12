-- Portail municipal — fondations. Deux nouveaux rôles distincts des rôles
-- citoyens existants (user/moderator/admin/super_admin) :
-- - municipal_staff : accès en lecture/suivi au portail de SA municipalité
--   (users.region_id sert de portée — un employé n'accède qu'aux données
--   de sa propre municipalité)
-- - municipal_admin : en plus, peut approuver d'autres demandes d'accès
--   pour la même municipalité
INSERT INTO roles (name, permissions) VALUES
  ('municipal_staff', '{"view_municipal_portal": true}'),
  ('municipal_admin', '{"view_municipal_portal": true, "manage_municipal_staff": true}')
ON CONFLICT (name) DO NOTHING;

-- Demandes d'accès au portail — approuvées manuellement par un admin
-- mon511 (contrôle qualité au départ, pourra s'automatiser plus tard une
-- fois le volume établi).
CREATE TABLE municipality_access_requests (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  region_id uuid NOT NULL REFERENCES regions(id),
  requested_role text NOT NULL DEFAULT 'municipal_staff' CHECK (requested_role IN ('municipal_staff', 'municipal_admin')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  job_title text,
  message text,
  requested_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES users(id)
);
CREATE INDEX idx_municipality_access_requests_status ON municipality_access_requests(status);

-- Palier d'abonnement par municipalité — détermine l'accès aux
-- fonctions avancées (statistiques poussées, comparatifs, export).
-- Fonctions de base (tableau de bord, liste, changement de statut interne)
-- toujours gratuites, peu importe le palier.
CREATE TABLE municipality_subscriptions (
  region_id uuid PRIMARY KEY REFERENCES regions(id),
  tier text NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

-- Suivi interne d'un signalement, séparé du statut PUBLIC (reports.status)
-- — permet à une municipalité de suivre son propre traitement (assigné à
-- qui, notes internes) sans jamais affecter ce que voient les citoyens.
CREATE TABLE report_municipal_tracking (
  report_id uuid PRIMARY KEY REFERENCES reports(id) ON DELETE CASCADE,
  region_id uuid NOT NULL REFERENCES regions(id),
  internal_status text NOT NULL DEFAULT 'new' CHECK (internal_status IN ('new', 'acknowledged', 'in_progress', 'done')),
  assigned_to text,
  internal_notes text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);
CREATE INDEX idx_report_municipal_tracking_region ON report_municipal_tracking(region_id);
