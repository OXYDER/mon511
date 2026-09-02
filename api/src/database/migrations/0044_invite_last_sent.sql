-- Date du dernier envoi par courriel d'une invitation — sert à limiter
-- le renvoi (protection anti-spam). NULL tant qu'aucun envoi n'a eu
-- lieu (invitation créée sans courriel, lien seul).
ALTER TABLE municipal_invites ADD COLUMN IF NOT EXISTS last_sent_at timestamptz;
-- La toute première génération avec courriel compte déjà comme un envoi.
UPDATE municipal_invites SET last_sent_at = created_at WHERE email IS NOT NULL AND last_sent_at IS NULL;
