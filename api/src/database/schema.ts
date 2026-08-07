import { ColumnType, Generated } from 'kysely';

// Reflète api/src/database/migrations/0001_init.sql — garder synchronisé
// à chaque migration ajoutée. Kysely donne le typage TypeScript sans le
// poids d'un ORM complet, ce qui convient mieux aux requêtes géospatiales
// PostGIS qu'on écrit à la main (voir reports.service.ts).

type Timestamp = ColumnType<Date, Date | string, Date | string>;

export interface RegionsTable {
  id: Generated<string>;
  parent_id: string | null;
  type: 'province' | 'territory' | 'municipality';
  name_fr: string;
  name_en: string;
  deployment_status: 'active' | 'partial' | 'inactive';
  source_mcode: string | null;
  created_at: Generated<Timestamp>;
}

export interface RolesTable {
  id: Generated<string>;
  name: string;
  permissions: Generated<Record<string, unknown>>;
}

export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  locale: Generated<'fr' | 'en'>;
  region_id: string | null;
  role_id: string;
  status: Generated<'active' | 'suspended' | 'banned'>;
  reputation_score: Generated<number>;
  privacy_settings: Generated<{
    show_reputation: boolean;
    show_report_history: boolean;
    show_region: boolean;
    show_real_name: boolean;
    last_name_display: 'full' | 'initial' | 'hidden';
    dm_permission: 'everyone' | 'shared_reports_only';
  }>;
  map_layer_preferences: Generated<{
    travaux_routiers: boolean;
    conditions_hivernales: boolean;
  }>;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
}

export interface ProblemCategoriesTable {
  id: Generated<string>;
  name_fr: string;
  name_en: string;
  icon: string | null;
  sort_order: Generated<number>;
  active: Generated<boolean>;
}

export interface ProblemTypesTable {
  id: Generated<string>;
  category_id: string;
  name_fr: string;
  name_en: string;
  icon: string | null;
  default_severity: 'low' | 'medium' | 'high' | null;
  sort_order: Generated<number>;
  active: Generated<boolean>;
}

export interface ReportsTable {
  id: Generated<string>;
  user_id: string | null;
  problem_type_id: string;
  region_id: string | null;
  location: string; // geometry(Point, 4326), manipulé via ST_* dans les requêtes
  gps_accuracy_m: number | null;
  address_text: string | null;
  description: string | null;
  status: Generated<'pending_moderation' | 'published_unresolved' | 'published_resolved' | 'rejected' | 'withdrawn'>;
  municipality_notified: Generated<'yes' | 'no' | 'unknown'>;
  municipality_name: string | null;
  municipality_case_number: string | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  resolved_at: Timestamp | null;
}

export interface ReportPhotosTable {
  id: Generated<string>;
  report_id: string;
  url: string;
  storage_driver: Generated<'minio' | 's3' | 'r2'>;
  storage_key: string;
  uploaded_at: Generated<Timestamp>;
}

export interface ReportConfirmationsTable {
  id: Generated<string>;
  report_id: string;
  user_id: string;
  created_at: Generated<Timestamp>;
}

export interface ReportFlagsTable {
  id: Generated<string>;
  report_id: string;
  user_id: string;
  reason: 'duplicate' | 'inappropriate' | 'wrong_location' | 'spam' | 'other';
  notes: string | null;
  created_at: Generated<Timestamp>;
  handled_at: Timestamp | null;
  handled_by: string | null;
}

export interface ReportMessagesTable {
  id: Generated<string>;
  report_id: string;
  author_id: string;
  author_role: 'user' | 'moderator';
  message: string;
  created_at: Generated<Timestamp>;
}

export interface ReportStatusHistoryTable {
  id: Generated<string>;
  report_id: string;
  old_status: string | null;
  new_status: string;
  changed_by: string | null;
  reason: string | null;
  changed_at: Generated<Timestamp>;
}

export interface ReportCommentsTable {
  id: Generated<string>;
  report_id: string;
  user_id: string;
  parent_comment_id: string | null;
  message: string;
  status: Generated<'visible' | 'hidden' | 'flagged'>;
  created_at: Generated<Timestamp>;
}

export interface ReportResolutionSuggestionsTable {
  id: Generated<string>;
  report_id: string;
  suggested_by: string;
  comment: string | null;
  weight: Generated<number>;
  status: Generated<'pending' | 'accepted' | 'dismissed'>;
  created_at: Generated<Timestamp>;
}

export interface ReputationEventsTable {
  id: Generated<string>;
  user_id: string;
  event_type: string;
  points: number;
  related_report_id: string | null;
  related_user_id: string | null;
  created_at: Generated<Timestamp>;
}

export interface NotificationsTable {
  id: Generated<string>;
  user_id: string;
  type: string;
  report_id: string | null;
  actor_id: string | null;
  title: string;
  body: string | null;
  read_at: Timestamp | null;
  email_sent_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

export interface MunicipalityIntegrationsTable {
  id: Generated<string>;
  region_id: string;
  auto_send_enabled: Generated<boolean>;
  notification_method: Generated<'email' | 'webhook' | 'api'>;
  contact_email: string | null;
  contact_phone: string | null;
  contact_website: string | null;
  mailing_address: string | null;
  postal_code: string | null;
  mrc_name: string | null;
  population: number | null;
  source_mcode: string | null;
  webhook_url: string | null;
  api_credentials: Record<string, unknown> | null;
  email_subject_template: string | null;
  email_body_template: string | null;
  notify_category_ids: string[] | null;
  created_at: Generated<Timestamp>;
  updated_at: Generated<Timestamp>;
  updated_by: string | null;
}

export interface SiteSettingsTable {
  key: string;
  value: unknown;
  updated_at: Generated<Timestamp>;
  updated_by: string | null;
}

export interface ConversationsTable {
  id: Generated<string>;
  created_at: Generated<Timestamp>;
}

export interface ConversationParticipantsTable {
  conversation_id: string;
  user_id: string;
  joined_at: Generated<Timestamp>;
}

export interface DirectMessagesTable {
  id: Generated<string>;
  conversation_id: string;
  sender_id: string;
  message: string;
  read_at: Timestamp | null;
  created_at: Generated<Timestamp>;
}

export interface UserBlocksTable {
  blocker_id: string;
  blocked_id: string;
  created_at: Generated<Timestamp>;
}

export interface ReportNotificationsTable {
  id: Generated<string>;
  report_id: string;
  region_id: string;
  method: 'email' | 'webhook' | 'api';
  status: Generated<'pending' | 'sent' | 'failed' | 'acknowledged'>;
  external_reference: string | null;
  error_message: string | null;
  attempted_at: Generated<Timestamp>;
  sent_at: Timestamp | null;
}

export interface ExternalDataSourcesTable {
  id: Generated<string>;
  name: string;
  provider: string;
  feed_key: string;
  feed_url: string;
  format: 'geojson' | 'csv' | 'json';
  license_note: string | null;
  sync_frequency_minutes: Generated<number>;
  last_synced_at: Timestamp | null;
  last_sync_status: string | null;
  last_sync_error: string | null;
  active: Generated<boolean>;
  created_at: Generated<Timestamp>;
}

export interface ExternalIncidentsTable {
  id: Generated<string>;
  source_id: string;
  external_id: string;
  location: string | null;
  raw_geometry: Record<string, unknown> | null;
  title: string | null;
  description: string | null;
  category: string | null;
  raw_data: Record<string, unknown>;
  first_seen_at: Generated<Timestamp>;
  last_seen_at: Generated<Timestamp>;
  is_stale: Generated<boolean>;
}

export interface Database {
  regions: RegionsTable;
  roles: RolesTable;
  users: UsersTable;
  problem_categories: ProblemCategoriesTable;
  problem_types: ProblemTypesTable;
  reports: ReportsTable;
  report_photos: ReportPhotosTable;
  report_confirmations: ReportConfirmationsTable;
  report_flags: ReportFlagsTable;
  report_messages: ReportMessagesTable;
  report_status_history: ReportStatusHistoryTable;
  report_comments: ReportCommentsTable;
  report_resolution_suggestions: ReportResolutionSuggestionsTable;
  reputation_events: ReputationEventsTable;
  notifications: NotificationsTable;
  municipality_integrations: MunicipalityIntegrationsTable;
  report_notifications: ReportNotificationsTable;
  conversations: ConversationsTable;
  conversation_participants: ConversationParticipantsTable;
  direct_messages: DirectMessagesTable;
  user_blocks: UserBlocksTable;
  external_data_sources: ExternalDataSourcesTable;
  external_incidents: ExternalIncidentsTable;
  site_settings: SiteSettingsTable;
}
