-- message_flags n'avait aucun moyen de suivre si un signalement de
-- message a déjà été traité par la modération — nécessaire pour
-- l'interface admin de gestion de la messagerie.
ALTER TABLE message_flags ADD COLUMN IF NOT EXISTS handled_at timestamptz;
ALTER TABLE message_flags ADD COLUMN IF NOT EXISTS handled_by uuid REFERENCES users(id);
CREATE INDEX IF NOT EXISTS idx_message_flags_unhandled ON message_flags(handled_at) WHERE handled_at IS NULL;
