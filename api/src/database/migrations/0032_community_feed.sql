CREATE TYPE post_visibility AS ENUM ('public', 'friends');
CREATE TYPE post_category AS ENUM ('road_conditions', 'community', 'general');
CREATE TYPE post_status AS ENUM ('pending_moderation', 'published', 'rejected');

CREATE TABLE posts (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  author_id uuid NOT NULL REFERENCES users(id),
  -- Lien optionnel vers un signalement partagé — référence, pas copie :
  -- si le signalement change de statut ou est retiré, le post dans le
  -- fil reflète ça automatiquement plutôt que d'avoir deux versions
  -- désynchronisées. La visibilité du signalement lui-même sur la carte
  -- (toujours publique) reste totalement indépendante de la visibilité
  -- CHOISIE ICI pour son apparition dans le fil.
  report_id uuid REFERENCES reports(id) ON DELETE SET NULL,
  category post_category NOT NULL DEFAULT 'general',
  body text,
  link_url text,
  visibility post_visibility NOT NULL DEFAULT 'public',
  status post_status NOT NULL DEFAULT 'pending_moderation',
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_posts_author ON posts(author_id);
CREATE INDEX idx_posts_status_visibility ON posts(status, visibility);
CREATE INDEX idx_posts_created ON posts(created_at);
CREATE INDEX idx_posts_report ON posts(report_id);

CREATE TABLE post_media (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  url text NOT NULL,
  media_type text NOT NULL CHECK (media_type IN ('photo', 'video')),
  order_index integer NOT NULL DEFAULT 0,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_post_media_post ON post_media(post_id);

CREATE TABLE post_comments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_post_comments_post ON post_comments(post_id);

CREATE TABLE post_reactions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  post_id uuid NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (post_id, user_id, emoji)
);
CREATE INDEX idx_post_reactions_post ON post_reactions(post_id);

-- Bascule admin — activer/désactiver la vidéo dans les publications du
-- fil communautaire, sans toucher au code (voir demande explicite).
INSERT INTO site_settings (key, value) VALUES ('feed_video_enabled', 'true');
