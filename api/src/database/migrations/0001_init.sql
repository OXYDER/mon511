-- mon511.ca / my511.ca — Migration initiale
-- Dérivée de mon511-modele-donnees.md v0.12
-- PostgreSQL 16+ avec extension PostGIS

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE region_type AS ENUM ('province', 'territory', 'municipality');
CREATE TYPE deployment_status AS ENUM ('active', 'partial', 'inactive');
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'banned');
CREATE TYPE report_status AS ENUM ('pending_moderation', 'published_unresolved', 'published_resolved', 'rejected');
CREATE TYPE municipality_notified_status AS ENUM ('yes', 'no', 'unknown');
CREATE TYPE flag_reason AS ENUM ('duplicate', 'inappropriate', 'wrong_location', 'spam', 'other');
CREATE TYPE message_author_role AS ENUM ('user', 'moderator');
CREATE TYPE comment_status AS ENUM ('visible', 'hidden', 'flagged');
CREATE TYPE suggestion_status AS ENUM ('pending', 'accepted', 'dismissed');
CREATE TYPE notification_type AS ENUM (
  'resolution_suggested', 'report_marked_resolved', 'report_rejected',
  'moderator_replied', 'comment_reply', 'direct_message_received', 'report_purge_warning'
);
CREATE TYPE notification_method AS ENUM ('email', 'webhook', 'api');
CREATE TYPE notification_send_status AS ENUM ('pending', 'sent', 'failed', 'acknowledged');
CREATE TYPE reputation_event_type AS ENUM (
  'report_confirmed_by_other', 'report_resolved', 'report_rejected',
  'gave_confirmation', 'flag_upheld', 'flag_rejected', 'report_flagged_valid',
  'resolution_suggestion_correct'
);

-- ============================================================
-- RÉGIONS (hiérarchie pays > province > municipalité)
-- ============================================================

CREATE TABLE regions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  parent_id uuid REFERENCES regions(id),
  type region_type NOT NULL,
  name_fr text NOT NULL,
  name_en text NOT NULL,
  boundary geometry(MultiPolygon, 4326),
  deployment_status deployment_status NOT NULL DEFAULT 'inactive',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_regions_parent ON regions(parent_id);
CREATE INDEX idx_regions_boundary ON regions USING GIST(boundary);

-- ============================================================
-- RÔLES & UTILISATEURS
-- ============================================================

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name text NOT NULL UNIQUE,
  permissions jsonb NOT NULL DEFAULT '{}'
);

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  email text NOT NULL UNIQUE,
  password_hash text,
  first_name text,
  last_name text,
  avatar_url text,
  locale text NOT NULL DEFAULT 'fr' CHECK (locale IN ('fr', 'en')),
  region_id uuid REFERENCES regions(id),
  role_id uuid NOT NULL REFERENCES roles(id),
  status user_status NOT NULL DEFAULT 'active',
  reputation_score integer NOT NULL DEFAULT 0,
  privacy_settings jsonb NOT NULL DEFAULT '{
    "show_reputation": true,
    "show_report_history": true,
    "show_region": true,
    "show_real_name": false,
    "dm_permission": "everyone"
  }',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_users_region ON users(region_id);
CREATE INDEX idx_users_role ON users(role_id);

-- ============================================================
-- CATÉGORIES & TYPES DE PROBLÈMES
-- ============================================================

CREATE TABLE problem_categories (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  name_fr text NOT NULL,
  name_en text NOT NULL,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE problem_types (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id uuid NOT NULL REFERENCES problem_categories(id),
  name_fr text NOT NULL,
  name_en text NOT NULL,
  icon text,
  default_severity text CHECK (default_severity IN ('low', 'medium', 'high')),
  sort_order integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true
);
CREATE INDEX idx_problem_types_category ON problem_types(category_id);
CREATE INDEX idx_problem_types_active ON problem_types(active);

-- ============================================================
-- SIGNALEMENTS (table centrale)
-- ============================================================

CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES users(id),
  problem_type_id uuid NOT NULL REFERENCES problem_types(id),
  region_id uuid REFERENCES regions(id),
  location geometry(Point, 4326) NOT NULL,
  gps_accuracy_m numeric,
  address_text text,
  description text,
  status report_status NOT NULL DEFAULT 'pending_moderation',
  municipality_notified municipality_notified_status NOT NULL DEFAULT 'unknown',
  municipality_name text,
  municipality_case_number text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX idx_reports_location ON reports USING GIST(location);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_reports_type ON reports(problem_type_id);
CREATE INDEX idx_reports_region ON reports(region_id);
CREATE INDEX idx_reports_created ON reports(created_at);
CREATE INDEX idx_reports_status_region ON reports(status, region_id);

CREATE TABLE report_photos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  url text NOT NULL,
  storage_driver text NOT NULL DEFAULT 'minio' CHECK (storage_driver IN ('minio', 's3', 'r2')),
  storage_key text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_report_photos_report ON report_photos(report_id);

CREATE TABLE report_confirmations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, user_id)
);

CREATE TABLE report_flags (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  reason flag_reason NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_report_flags_report ON report_flags(report_id);

CREATE TABLE report_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users(id),
  author_role message_author_role NOT NULL,
  message text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_report_messages_report ON report_messages(report_id);

CREATE TABLE report_status_history (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  old_status report_status,
  new_status report_status NOT NULL,
  changed_by uuid REFERENCES users(id),
  reason text,
  changed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reason_required_on_rejection CHECK (new_status != 'rejected' OR reason IS NOT NULL)
);
CREATE INDEX idx_report_status_history_report ON report_status_history(report_id);

CREATE TABLE report_comments (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  parent_comment_id uuid REFERENCES report_comments(id),
  message text NOT NULL,
  status comment_status NOT NULL DEFAULT 'visible',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_report_comments_report ON report_comments(report_id);
CREATE INDEX idx_report_comments_parent ON report_comments(parent_comment_id);
CREATE INDEX idx_report_comments_status ON report_comments(status);

CREATE TABLE report_resolution_suggestions (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  suggested_by uuid NOT NULL REFERENCES users(id),
  comment text,
  weight integer NOT NULL DEFAULT 1,
  status suggestion_status NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (report_id, suggested_by)
);
CREATE INDEX idx_resolution_suggestions_report ON report_resolution_suggestions(report_id);

-- ============================================================
-- RÉPUTATION
-- ============================================================

CREATE TABLE reputation_events (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id),
  event_type reputation_event_type NOT NULL,
  points integer NOT NULL,
  related_report_id uuid REFERENCES reports(id),
  related_user_id uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_reputation_events_user ON reputation_events(user_id);
CREATE INDEX idx_reputation_events_type ON reputation_events(event_type);
CREATE INDEX idx_reputation_events_report ON reputation_events(related_report_id);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid NOT NULL REFERENCES users(id),
  type notification_type NOT NULL,
  report_id uuid REFERENCES reports(id),
  actor_id uuid REFERENCES users(id),
  title text NOT NULL,
  body text,
  read_at timestamptz,
  email_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_notifications_user_unread ON notifications(user_id, read_at);
CREATE INDEX idx_notifications_report ON notifications(report_id);

-- ============================================================
-- MESSAGERIE PRIVÉE
-- ============================================================

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE conversation_participants (
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id),
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

CREATE TABLE direct_messages (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id),
  message text NOT NULL,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_direct_messages_conversation ON direct_messages(conversation_id);

CREATE TABLE user_blocks (
  blocker_id uuid NOT NULL REFERENCES users(id),
  blocked_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_id, blocked_id)
);

CREATE TABLE message_flags (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id uuid NOT NULL REFERENCES direct_messages(id) ON DELETE CASCADE,
  flagged_by uuid NOT NULL REFERENCES users(id),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- INTÉGRATIONS MUNICIPALES
-- ============================================================

CREATE TABLE municipality_integrations (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id uuid NOT NULL UNIQUE REFERENCES regions(id),
  auto_send_enabled boolean NOT NULL DEFAULT false,
  notification_method notification_method NOT NULL DEFAULT 'email',
  contact_email text,
  webhook_url text,
  api_credentials jsonb,
  email_subject_template text,
  email_body_template text,
  notify_category_ids uuid[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

CREATE TABLE report_notifications (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  region_id uuid NOT NULL REFERENCES regions(id),
  method notification_method NOT NULL,
  status notification_send_status NOT NULL DEFAULT 'pending',
  external_reference text,
  error_message text,
  attempted_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX idx_report_notifications_report ON report_notifications(report_id);
CREATE INDEX idx_report_notifications_region ON report_notifications(region_id);
CREATE INDEX idx_report_notifications_status ON report_notifications(status);

-- ============================================================
-- CONFIGURATION & ADMIN
-- ============================================================

CREATE TABLE site_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

CREATE TABLE translations (
  key text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('fr', 'en')),
  value text NOT NULL,
  PRIMARY KEY (key, locale)
);

CREATE TABLE changelog_entries (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  version text NOT NULL,
  release_date date NOT NULL,
  notes text NOT NULL,
  created_by uuid REFERENCES users(id)
);

-- ============================================================
-- VALEURS PAR DÉFAUT DES PARAMÈTRES DU SITE
-- ============================================================

INSERT INTO site_settings (key, value) VALUES
  ('require_moderation', 'true'),
  ('require_rejection_reason', 'true'),
  ('require_precise_gps', 'false'),
  ('allow_anonymous_reports', 'false'),
  ('show_municipality_badge', 'true'),
  ('rejected_report_retention_days', '365'),
  ('purge_notice_days', '7'),
  ('storage_driver', '"minio"'),
  ('storage_capacity_warning_threshold_percent', '80'),
  ('auto_notify_municipalities', 'true'),
  ('resolution_suggestion_threshold', '5'),
  ('push_notifications_enabled', 'false'),
  ('push_provider_credentials', '{}'),
  ('default_municipality_email_subject', '"Nouveau signalement — {{problem_type}} à {{municipality_name}}"'),
  ('default_municipality_email_template', '"Bonjour,\n\nUn nouveau signalement a été soumis via mon511.ca :\n\nType : {{problem_type}}\nAdresse : {{address}}\nDescription : {{description}}\nSignalé le : {{reported_at}}\n\nVoir le signalement : {{report_url}}"');

-- Rôles de base
INSERT INTO roles (name, permissions) VALUES
  ('user', '{}'),
  ('moderator', '{"moderate_reports": true, "moderate_comments": true}'),
  ('admin', '{"moderate_reports": true, "moderate_comments": true, "manage_categories": true, "manage_users": true, "manage_regions": true}'),
  ('super_admin', '{"*": true}');
