-- Cycle de vie complet des signalements : refus avec fenêtre de correction,
-- confirmation périodique de validité, archivage, suppression définitive.

ALTER TYPE report_status ADD VALUE IF NOT EXISTS 'archived';

ALTER TABLE reports ADD COLUMN IF NOT EXISTS rejected_at timestamptz;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS last_confirmed_at timestamptz;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS staleness_reminder_sent_at timestamptz;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Jetons de confirmation à usage unique envoyés par courriel (lien direct,
-- sans connexion requise) — même esprit que verification_codes, mais pour
-- un lien cliquable plutôt qu'un code à taper. La confirmation communautaire
-- elle-même passe par la table report_confirmations déjà existante.
CREATE TABLE report_confirmation_tokens (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX idx_report_confirmation_tokens_report ON report_confirmation_tokens(report_id);

-- Délais du cycle de vie — tous modifiables dans l'admin, valeurs par
-- défaut reflétant exactement ce qui a été discuté.
INSERT INTO site_settings (key, value) VALUES (
  'lifecycle_days',
  '{"rejectionCorrectionDays": 7, "stalenessWarningDays": 30, "stalenessDeadlineDays": 15, "archiveRetentionYears": 2, "duplicateDetectionRadiusMeters": 15}'
) ON CONFLICT (key) DO NOTHING;
