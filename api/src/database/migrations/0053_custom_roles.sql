-- Rôles personnalisables — au-delà des trois rangs fixes (director/
-- foreman/employee), une municipalité peut créer ses propres rôles
-- nommés (ex. "Inspecteur", "Lecture seule", "Sous-traitant") avec
-- leurs propres permissions. Retire la contrainte CHECK qui limitait
-- municipal_rank et municipal_rank_permissions.rank aux trois valeurs
-- fixes — un rôle personnalisé est simplement une nouvelle ligne dans
-- municipal_rank_permissions avec un nom arbitraire comme "rank".
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_municipal_rank_check;
ALTER TABLE municipal_rank_permissions DROP CONSTRAINT IF EXISTS municipal_rank_permissions_rank_check;

-- Nom affiché et icône — nécessaires pour un rôle personnalisé
-- (les trois rangs fixes gardent leurs libellés/icônes codés en dur
-- côté frontend, jamais utilisés pour ceux-là).
ALTER TABLE municipal_rank_permissions ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE municipal_rank_permissions ADD COLUMN IF NOT EXISTS icon text;
