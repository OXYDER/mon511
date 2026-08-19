-- Approximation "en ligne" — pas de vraie infrastructure temps réel
-- (WebSocket), juste la dernière fois que l'usager a fait une requête
-- authentifiée. "En ligne" sera défini côté application comme "actif
-- dans les 5 dernières minutes".
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_users_last_active ON users(last_active_at);

CREATE TABLE message_reactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id uuid NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX idx_message_reactions_message ON message_reactions(message_id);
