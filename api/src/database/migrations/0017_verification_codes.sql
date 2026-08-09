CREATE TYPE verification_purpose AS ENUM ('signup', 'email_change', 'password_change', 'password_reset');

CREATE TABLE verification_codes (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  email text NOT NULL, -- adresse à laquelle le code a été envoyé (peut différer de users.email pour un changement de courriel en attente)
  purpose verification_purpose NOT NULL,
  code_hash text NOT NULL, -- jamais le code en clair, même en base
  metadata jsonb, -- ex. {"newEmail": "..."} ou {"newPasswordHash": "..."} pour les changements en attente
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  attempts integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_verification_codes_lookup ON verification_codes (email, purpose, used_at);

-- Les comptes déjà existants sont considérés vérifiés (ils se sont déjà
-- connectés avec succès) — seuls les NOUVEAUX comptes commenceront non
-- vérifiés, via le flux d'inscription mis à jour.
ALTER TABLE users ADD COLUMN email_verified boolean NOT NULL DEFAULT true;
