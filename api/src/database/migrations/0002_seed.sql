-- Données de départ pour un premier déploiement fonctionnel.
-- Les régions n'ont pas de `boundary` géographique réelle (polygones précis
-- non disponibles ici) — la dérivation automatique de région par jointure
-- spatiale (voir reports.service.ts) ne fonctionnera donc pas tant que de
-- vraies frontières ne sont pas importées (ex. depuis Statistique Canada /
-- limites des divisions de recensement). Pour l'instant, `region_id` restera
-- `null` sur les nouveaux signalements — sans impact bloquant, juste une
-- fonctionnalité à activer plus tard.

INSERT INTO problem_categories (name_fr, name_en, icon, sort_order) VALUES
  ('Chaussée', 'Road surface', 'road', 1),
  ('Infrastructure', 'Infrastructure', 'bridge', 2),
  ('Services publics', 'Public utilities', 'droplet', 3),
  ('Sécurité', 'Safety', 'alert-triangle', 4);

INSERT INTO problem_types (category_id, name_fr, name_en, icon, default_severity, sort_order)
SELECT id, 'Nid-de-poule', 'Pothole', '🕳️', 'medium', 1 FROM problem_categories WHERE name_fr = 'Chaussée'
UNION ALL
SELECT id, 'Débris sur la route', 'Debris on road', '📦', 'medium', 2 FROM problem_categories WHERE name_fr = 'Chaussée'
UNION ALL
SELECT id, 'Travaux routiers', 'Roadworks', '🚧', 'low', 3 FROM problem_categories WHERE name_fr = 'Chaussée'
UNION ALL
SELECT id, 'Pont ou route endommagée', 'Damaged bridge or road', '🌉', 'high', 1 FROM problem_categories WHERE name_fr = 'Infrastructure'
UNION ALL
SELECT id, 'Poteau brisé', 'Broken pole', '⚡', 'high', 2 FROM problem_categories WHERE name_fr = 'Infrastructure'
UNION ALL
SELECT id, 'Bris d''aqueduc', 'Water main break', '💧', 'high', 1 FROM problem_categories WHERE name_fr = 'Services publics'
UNION ALL
SELECT id, 'Animal mort sur la route', 'Dead animal on road', '🦌', 'low', 1 FROM problem_categories WHERE name_fr = 'Sécurité';

INSERT INTO regions (type, name_fr, name_en, deployment_status) VALUES
  ('province', 'Québec', 'Quebec', 'active'),
  ('province', 'Ontario', 'Ontario', 'inactive'),
  ('province', 'Colombie-Britannique', 'British Columbia', 'inactive'),
  ('province', 'Alberta', 'Alberta', 'inactive');

INSERT INTO regions (parent_id, type, name_fr, name_en, deployment_status)
SELECT id, 'municipality'::region_type, 'Sherbrooke', 'Sherbrooke', 'active'::deployment_status FROM regions WHERE name_fr = 'Québec'
UNION ALL
SELECT id, 'municipality'::region_type, 'Montréal', 'Montreal', 'active'::deployment_status FROM regions WHERE name_fr = 'Québec'
UNION ALL
SELECT id, 'municipality'::region_type, 'Québec', 'Quebec City', 'active'::deployment_status FROM regions WHERE name_fr = 'Québec';
