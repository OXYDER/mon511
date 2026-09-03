-- Numéro de dossier municipal immuable — format MON-<abrégé
-- municipalité>-<année>-<numéro séquentiel par municipalité et par
-- année>, ex. MON-DAN-2026-00184. Assigné une seule fois à la
-- création de l'incident, jamais modifié ensuite.
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS case_number text UNIQUE;

-- Priorité de l'incident — même échelle que work_orders.priority,
-- pour la cohérence. Calculée automatiquement (voir
-- computeIncidentPriority), mais un gestionnaire peut la remplacer
-- manuellement (priority_overridden = true fige alors la valeur,
-- le calcul automatique ne l'écrase plus).
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent'));
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS priority_overridden boolean NOT NULL DEFAULT false;
-- Score brut (0-100) et facteurs — conservés pour affichage
-- ("pourquoi ce score"), pas seulement le résultat final.
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS priority_score integer;
ALTER TABLE incidents ADD COLUMN IF NOT EXISTS priority_factors jsonb;

-- Règles SLA (délai de service) — configurables PAR MUNICIPALITÉ ET
-- PAR TYPE DE PROBLÈME (problem_type_id NULL = règle par défaut de la
-- municipalité, s'applique à tout type sans règle spécifique).
CREATE TABLE sla_rules (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id uuid NOT NULL REFERENCES regions(id),
  problem_type_id uuid REFERENCES problem_types(id),
  target_acknowledgment_hours integer NOT NULL DEFAULT 48,
  target_resolution_hours integer NOT NULL DEFAULT 336, -- 14 jours
  UNIQUE(region_id, problem_type_id)
);
CREATE INDEX idx_sla_rules_region ON sla_rules(region_id);

-- Compteur séquentiel PAR municipalité ET PAR ANNÉE — une seule
-- requête UPSERT atomique incrémente ce compteur, évite toute
-- collision entre deux créations de dossier simultanées (contrairement
-- à un simple SELECT COUNT(*) + 1, sujet à une course).
CREATE TABLE case_number_counters (
  region_id uuid NOT NULL REFERENCES regions(id),
  year integer NOT NULL,
  next_number integer NOT NULL DEFAULT 1,
  PRIMARY KEY (region_id, year)
);
