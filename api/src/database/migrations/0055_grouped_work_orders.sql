-- Bons de travail groupés — un bon de travail peut maintenant être lié
-- à PLUSIEURS incidents/signalements à la fois (pas seulement un
-- seul), demandé explicitement. work_orders.group_key est conservé
-- (représente le PREMIER incident lié, pour compatibilité avec le
-- code existant qui ne connaît qu'un seul lien — tournée du mode
-- terrain, détection d'emplacements récurrents) — cette nouvelle table
-- devient la vraie source de vérité pour la liste complète des
-- incidents liés.
CREATE TABLE work_order_incidents (
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  group_key text NOT NULL,
  PRIMARY KEY (work_order_id, group_key)
);
CREATE INDEX idx_work_order_incidents_group_key ON work_order_incidents(group_key);

-- Rattrapage — les bons de travail déjà liés à un incident (group_key
-- rempli) obtiennent une entrée correspondante dans la nouvelle table,
-- pour que les deux structures restent cohérentes dès le départ.
INSERT INTO work_order_incidents (work_order_id, group_key)
SELECT id, group_key FROM work_orders WHERE group_key IS NOT NULL
ON CONFLICT DO NOTHING;
