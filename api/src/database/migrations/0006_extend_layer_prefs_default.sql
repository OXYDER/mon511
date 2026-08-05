-- Étend le défaut pour les nouveaux comptes — les comptes existants gardent
-- leurs préférences actuelles (les nouvelles clés seront simplement absentes,
-- traitées comme "désactivé" côté client, sans erreur).
ALTER TABLE users
  ALTER COLUMN map_layer_preferences SET DEFAULT '{
    "travaux_routiers": false,
    "conditions_hivernales": false,
    "avertissements": false,
    "debit_circulation": false
  }';
