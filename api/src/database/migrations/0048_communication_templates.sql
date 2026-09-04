-- Modèles de communication — messages pré-écrits réutilisables pour la
-- note publique lors d'un changement de statut, plutôt que de retaper
-- le même texte à chaque fois. Configurables par municipalité (clé
-- fixe pour les identifier, texte personnalisable).
CREATE TABLE communication_templates (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  region_id uuid NOT NULL REFERENCES regions(id),
  template_key text NOT NULL, -- ex. 'acknowledgment', 'inspection_scheduled'
  body text NOT NULL,
  UNIQUE(region_id, template_key)
);
CREATE INDEX idx_communication_templates_region ON communication_templates(region_id);
