-- Rang d'un employé municipal — SEULEMENT pour municipal_staff, jamais
-- municipal_admin (qui garde toujours un accès complet peu importe le
-- rang, c'est le gestionnaire principal). Trois rangs FIXES, jamais
-- créés/supprimés par l'admin — seules leurs permissions le sont.
ALTER TABLE users ADD COLUMN IF NOT EXISTS municipal_rank text CHECK (municipal_rank IN ('director', 'foreman', 'employee'));

-- Permissions configurables par rang, PAR MUNICIPALITÉ (chacune peut
-- configurer différemment) — une ligne par (région, rang). Valeurs par
-- défaut raisonnables au premier accès (director = tout, foreman =
-- voir/modifier signalements + stats sans gérer l'équipe/paramètres,
-- employee = lecture seule des signalements).
CREATE TABLE municipal_rank_permissions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id uuid NOT NULL REFERENCES regions(id),
  rank text NOT NULL CHECK (rank IN ('director', 'foreman', 'employee')),
  can_view_dashboard boolean NOT NULL DEFAULT true,
  can_view_reports boolean NOT NULL DEFAULT true,
  can_edit_reports boolean NOT NULL DEFAULT false,
  can_view_stats boolean NOT NULL DEFAULT true,
  can_view_comparatives boolean NOT NULL DEFAULT true,
  can_manage_team boolean NOT NULL DEFAULT false,
  can_manage_settings boolean NOT NULL DEFAULT false,
  UNIQUE(region_id, rank)
);

-- Liens d'invitation — jeton aléatoire cryptographique, usage unique
-- (used_at NOT NULL = déjà consommé), durée de vie courte (48h,
-- imposée côté application au moment de la génération).
CREATE TABLE municipal_invites (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id uuid NOT NULL REFERENCES regions(id),
  rank text NOT NULL CHECK (rank IN ('director', 'foreman', 'employee')),
  token text NOT NULL UNIQUE,
  created_by uuid NOT NULL REFERENCES users(id),
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_municipal_invites_token ON municipal_invites(token);
