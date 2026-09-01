-- Paramètres du rapport périodique d'une municipalité — fréquence
-- d'envoi et quelles statistiques afficher (courriel ET portail,
-- toutes deux pilotées par le même réglage). Une ligne par
-- municipalité, créée à la demande (pas systématiquement pour toutes
-- les régions) — absence de ligne = valeurs par défaut raisonnables.
CREATE TYPE report_frequency AS ENUM ('weekly', 'monthly');

CREATE TABLE municipality_report_settings (
  region_id uuid PRIMARY KEY REFERENCES regions(id),
  frequency report_frequency NOT NULL DEFAULT 'monthly',
  -- Tableau de clés de statistiques activées — voir
  -- municipal-portal.service.ts pour la liste des clés valides
  -- (active_by_type, resolved_period, new_period, removed_period,
  -- ranking, resolution_performance, top_streets, most_confirmed).
  -- Toutes activées par défaut.
  enabled_stats jsonb NOT NULL DEFAULT '["active_by_type","resolved_period","new_period","removed_period","ranking","resolution_performance","top_streets","most_confirmed"]',
  last_report_sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
