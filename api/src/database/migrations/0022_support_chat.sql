-- Chat de support avec IA (Gemini) + tickets — pour les usagers connectés
-- ET anonymes (session_id en localStorage pour ces derniers).

CREATE TABLE support_conversations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  session_id text, -- pour les visiteurs anonymes, sans compte
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_conversations_user ON support_conversations(user_id);
CREATE INDEX idx_support_conversations_session ON support_conversations(session_id);

CREATE TABLE support_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_messages_conversation ON support_messages(conversation_id);

CREATE TABLE support_tickets (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid REFERENCES support_conversations(id) ON DELETE SET NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  email text NOT NULL,
  name text,
  subject text NOT NULL,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  created_by text NOT NULL DEFAULT 'ai' CHECK (created_by IN ('ai', 'user')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX idx_support_tickets_status ON support_tickets(status);

CREATE TABLE support_ticket_replies (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  ticket_id uuid NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  author_type text NOT NULL CHECK (author_type IN ('admin', 'user')),
  author_id uuid REFERENCES users(id) ON DELETE SET NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_support_ticket_replies_ticket ON support_ticket_replies(ticket_id);
