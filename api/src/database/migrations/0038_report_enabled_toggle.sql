-- Interrupteur distinct pour activer/désactiver le rapport périodique,
-- séparé de la fréquence elle-même (demandé explicitement : une case
-- pour l'activer, ET une sélection du délai). Désactivé par défaut —
-- une municipalité doit choisir explicitement de le recevoir.
ALTER TABLE municipality_report_settings ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT false;
