-- Automatisations "Quand → Si → Alors" — appliquées automatiquement à
-- la création d'un nouvel incident (jamais rétroactivement sur les
-- incidents existants, pour rester prévisible). Une règle peut cibler
-- un type de problème précis (trigger_problem_type_id) et/ou un mot-clé
-- dans la description (trigger_keyword, recherche simple ILIKE) — les
-- deux conditions doivent être vraies si les deux sont fournies.
CREATE TABLE automation_rules (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id uuid NOT NULL REFERENCES regions(id),
  name text NOT NULL,
  trigger_problem_type_id uuid REFERENCES problem_types(id), -- null = n'importe quel type
  trigger_keyword text, -- null = pas de condition sur le texte
  action_priority text CHECK (action_priority IN ('low', 'medium', 'high', 'urgent')), -- null = ne touche pas la priorité
  action_assigned_to text, -- null = ne touche pas l'assignation
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_automation_rules_region ON automation_rules(region_id);
