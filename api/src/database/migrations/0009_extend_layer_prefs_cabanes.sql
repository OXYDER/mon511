ALTER TABLE users
  ALTER COLUMN map_layer_preferences SET DEFAULT '{
    "travaux_routiers": false,
    "conditions_hivernales": false,
    "avertissements": false,
    "debit_circulation": false,
    "feux_foret": false,
    "cabanes_a_sucre": false
  }';
