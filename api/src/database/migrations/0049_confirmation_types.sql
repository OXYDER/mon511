-- Type de confirmation citoyenne — au lieu d'un simple "toujours là"
-- binaire, trois nuances distinctes. 'still_present' par défaut pour
-- les confirmations déjà existantes (comportement identique à avant).
ALTER TABLE report_confirmations ADD COLUMN IF NOT EXISTS confirmation_type text NOT NULL DEFAULT 'still_present'
  CHECK (confirmation_type IN ('still_present', 'more_dangerous', 'seems_fixed'));
