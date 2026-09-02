-- Courriel ciblé pour une invitation — optionnel, si présent
-- l'invitation est envoyée par courriel ET la rédemption exige que le
-- compte qui l'utilise ait exactement cette adresse (empêche une autre
-- personne d'utiliser un lien destiné à quelqu'un d'autre). Si absent,
-- comportement inchangé (lien générique, n'importe quel compte
-- connecté peut l'utiliser).
ALTER TABLE municipal_invites ADD COLUMN IF NOT EXISTS email text;
