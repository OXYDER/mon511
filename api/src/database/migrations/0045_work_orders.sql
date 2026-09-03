-- Bons de travail — le plus complet possible, demandé explicitement.
-- Peut partir d'un incident existant (group_key rempli) OU exister
-- librement (ex. entretien préventif sans signalement citoyen,
-- group_key null — adresse alors saisie directement sur le bon).
CREATE TABLE work_orders (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id uuid NOT NULL REFERENCES regions(id),
  group_key text, -- incident lié, optionnel — même logique COALESCE déjà utilisée partout ailleurs
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'in_progress', 'completed', 'cancelled')),
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'urgent')),
  assigned_to text,
  address_text text, -- seulement utile si group_key est null (sinon dérivée de l'incident)
  scheduled_date date,
  due_date date,
  completed_at timestamptz,
  estimated_hours numeric(6,2),
  actual_hours numeric(6,2),
  estimated_cost numeric(10,2),
  actual_cost numeric(10,2),
  notes text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_work_orders_region ON work_orders(region_id);
CREATE INDEX idx_work_orders_group_key ON work_orders(group_key);
CREATE INDEX idx_work_orders_status ON work_orders(status);

-- Liste de vérification — étapes à cocher pour compléter le bon.
CREATE TABLE work_order_tasks (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  description text NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_work_order_tasks_wo ON work_order_tasks(work_order_id);

-- Photos avant/pendant/après — même principe que report_photos, mais
-- avec une phase pour distinguer l'état du travail.
CREATE TABLE work_order_photos (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  work_order_id uuid NOT NULL REFERENCES work_orders(id) ON DELETE CASCADE,
  url text NOT NULL,
  phase text NOT NULL DEFAULT 'before' CHECK (phase IN ('before', 'during', 'after')),
  uploaded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_work_order_photos_wo ON work_order_photos(work_order_id);
