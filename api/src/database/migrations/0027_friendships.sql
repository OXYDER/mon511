CREATE TABLE friendships (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  addressee_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (requester_id, addressee_id),
  CHECK (requester_id != addressee_id)
);
CREATE INDEX idx_friendships_addressee_pending ON friendships(addressee_id) WHERE status = 'pending';
CREATE INDEX idx_friendships_requester ON friendships(requester_id);
