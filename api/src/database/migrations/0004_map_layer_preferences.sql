-- Préférences de couches cartographiques (Travaux routiers / Conditions
-- routières hivernales) mémorisées par usager — activable/désactivable
-- indépendamment, comme demandé.

ALTER TABLE users
  ADD COLUMN map_layer_preferences jsonb NOT NULL DEFAULT '{"travaux_routiers": false, "conditions_hivernales": false}';
