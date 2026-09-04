-- Répertoire d'entrepreneurs/fournisseurs — assignable à un bon de
-- travail, pour tracer qui a fait le travail quand ce n'est pas
-- l'équipe municipale elle-même.
CREATE TABLE contractors (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id uuid NOT NULL REFERENCES regions(id),
  name text NOT NULL,
  specialty text,
  contact_name text,
  contact_email text,
  contact_phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_contractors_region ON contractors(region_id);

ALTER TABLE work_orders ADD COLUMN IF NOT EXISTS contractor_id uuid REFERENCES contractors(id);

-- Documents attachés à un bon de travail — soumissions, factures.
-- Même principe que work_order_photos, mais pour des documents
-- (pas nécessairement des images).
CREATE TABLE work_order_documents (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  url text NOT NULL,
  filename text NOT NULL,
  document_type text NOT NULL DEFAULT 'other' CHECK (document_type IN ('quote', 'invoice', 'other')),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_work_order_documents_wo ON work_order_documents(work_order_id);

-- Budget annuel par catégorie (type de problème, ou libre si null) —
-- montant planifié, comparé aux dépenses réelles calculées à partir
-- des bons de travail complétés (pas stocké, calculé à la volée pour
-- toujours refléter l'état réel).
CREATE TABLE budget_lines (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id uuid NOT NULL REFERENCES regions(id),
  year integer NOT NULL,
  category text NOT NULL, -- libre — nom du poste budgétaire, pas forcément lié à un problem_type
  planned_amount numeric(12,2) NOT NULL DEFAULT 0,
  UNIQUE(region_id, year, category)
);
CREATE INDEX idx_budget_lines_region_year ON budget_lines(region_id, year);
