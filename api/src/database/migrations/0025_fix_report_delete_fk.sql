-- Deux tables référencent reports(id) SANS ON DELETE CASCADE ni SET NULL,
-- ce qui bloquait toute suppression d'un signalement ayant au moins un
-- événement de réputation ou une notification associée (violation de
-- contrainte de clé étrangère → erreur 500) — touchait autant la
-- suppression manuelle par un admin que la purge automatique nocturne des
-- signalements archivés expirés (LifecycleService).
--
-- SET NULL plutôt que CASCADE : on garde l'historique (réputation,
-- notifications déjà envoyées) même après la suppression du signalement
-- auquel il se rattachait, juste sans lien vers un signalement qui
-- n'existe plus.

ALTER TABLE reputation_events DROP CONSTRAINT IF EXISTS reputation_events_related_report_id_fkey;
ALTER TABLE reputation_events
  ADD CONSTRAINT reputation_events_related_report_id_fkey
  FOREIGN KEY (related_report_id) REFERENCES reports(id) ON DELETE SET NULL;

ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_report_id_fkey;
ALTER TABLE notifications
  ADD CONSTRAINT notifications_report_id_fkey
  FOREIGN KEY (report_id) REFERENCES reports(id) ON DELETE SET NULL;
