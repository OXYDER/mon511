-- Suivi du tutoriel d'accueil — null tant que jamais complété ou passé,
-- horodatage sinon. Permet aussi de le recommencer volontairement
-- (remis à null) depuis les paramètres du profil.
ALTER TABLE users ADD COLUMN IF NOT EXISTS tutorial_completed_at timestamptz;
