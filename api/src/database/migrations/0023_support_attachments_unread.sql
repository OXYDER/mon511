-- Pièces jointes sur les billets (à la création ou en réponse).
CREATE TABLE support_ticket_attachments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  reply_id uuid REFERENCES support_ticket_replies(id) ON DELETE CASCADE,
  url text NOT NULL,
  filename text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_ticket_attachments_ticket ON support_ticket_attachments(ticket_id);

-- Suivi de lecture — pour savoir si une réponse de l'équipe n'a pas encore
-- été vue par l'usager (icône Aide qui flashe).
ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS last_user_seen_at timestamptz;
ALTER TABLE support_conversations ADD COLUMN IF NOT EXISTS last_user_seen_at timestamptz;
