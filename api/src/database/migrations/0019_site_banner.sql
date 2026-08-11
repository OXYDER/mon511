-- Bannière de notification en haut du site — activable/désactivable,
-- programmable par dates, fermable individuellement par chaque usager
-- (mémorisé jusqu'au prochain changement de contenu par l'admin).
INSERT INTO site_settings (key, value) VALUES (
  'site_banner',
  '{"enabled": true, "message": "Notre site est en développement et en mode Alpha. Les fonctions et paramètres peuvent changer à tout moment. Testez avec nous! Merci.", "messageEn": "Our site is in development and in Alpha mode. Features and settings may change at any time. Test with us! Thank you.", "startDate": null, "endDate": null, "version": 1}'
) ON CONFLICT (key) DO NOTHING;
