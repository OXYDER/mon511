INSERT INTO problem_types (category_id, name_fr, name_en, icon, default_severity, sort_order)
SELECT id, 'Rigole/Ravinement', 'Ditch/Gully erosion', '🌊', 'medium', 4
FROM problem_categories WHERE name_fr = 'Chaussée';
