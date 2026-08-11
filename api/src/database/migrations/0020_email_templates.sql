-- Gabarits de courriels modifiables dans l'admin, avec variables
-- {{nomDeVariable}} substituées au moment de l'envoi. Chaque gabarit a une
-- valeur par défaut définie ici — l'admin peut la personnaliser, et le
-- système retombe sur cette valeur par défaut si jamais la ligne est
-- absente (ne devrait pas arriver en pratique, filet de sécurité).
CREATE TABLE email_templates (
  key text PRIMARY KEY,
  subject text NOT NULL,
  body_html text NOT NULL,
  description text NOT NULL,
  available_variables text[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES users(id)
);

INSERT INTO email_templates (key, subject, body_html, description, available_variables) VALUES

('verify_signup',
 'Confirme ton compte mon511.ca',
 'Bienvenue {{firstName}}!<br /><br />Pour activer ton compte, utilise le code de vérification ci-dessous.<br /><br /><strong style="font-size:22px; letter-spacing:3px; color:#FF5A1F;">{{code}}</strong><br /><br />Ce code expire dans {{expiryMinutes}} minutes. Si tu n''es pas à l''origine de cette demande, ignore simplement ce courriel.',
 'Envoyé à la création d''un compte, pour confirmer l''adresse courriel.',
 ARRAY['firstName', 'code', 'expiryMinutes']),

('verify_email_change',
 'Confirme ton nouveau courriel — mon511.ca',
 'Bonjour {{firstName}},<br /><br />Utilise le code ci-dessous pour confirmer que <strong>{{newEmail}}</strong> est bien ta nouvelle adresse courriel.<br /><br /><strong style="font-size:22px; letter-spacing:3px; color:#FF5A1F;">{{code}}</strong><br /><br />Ce code expire dans {{expiryMinutes}} minutes.',
 'Envoyé à la nouvelle adresse lors d''un changement de courriel.',
 ARRAY['firstName', 'newEmail', 'code', 'expiryMinutes']),

('verify_password_change',
 'Confirme le changement de mot de passe — mon511.ca',
 'Bonjour {{firstName}},<br /><br />Utilise le code ci-dessous pour confirmer le changement de ton mot de passe.<br /><br /><strong style="font-size:22px; letter-spacing:3px; color:#FF5A1F;">{{code}}</strong><br /><br />Ce code expire dans {{expiryMinutes}} minutes. Si tu n''es pas à l''origine de cette demande, ignore ce courriel et ton mot de passe restera inchangé.',
 'Envoyé pour confirmer un changement de mot de passe demandé depuis le profil.',
 ARRAY['firstName', 'code', 'expiryMinutes']),

('verify_password_reset',
 'Réinitialisation de ton mot de passe — mon511.ca',
 'Bonjour,<br /><br />Utilise le code ci-dessous pour choisir un nouveau mot de passe.<br /><br /><strong style="font-size:22px; letter-spacing:3px; color:#FF5A1F;">{{code}}</strong><br /><br />Ce code expire dans {{expiryMinutes}} minutes. Si tu n''es pas à l''origine de cette demande, ignore simplement ce courriel.',
 'Envoyé lors d''une demande de mot de passe oublié.',
 ARRAY['code', 'expiryMinutes']),

('report_received',
 'Ton signalement a été reçu — mon511.ca',
 'Bonjour {{firstName}},<br /><br />Merci! Ton signalement a bien été reçu et sera examiné par notre équipe de modération sous peu.{{reportInfoCard}}Tu recevras un courriel dès qu''une décision sera prise.',
 'Envoyé à l''usager immédiatement après la création d''un signalement.',
 ARRAY['firstName', 'reportType', 'reportDate', 'reportStatus', 'reportAddress', 'reportMunicipality', 'reportPhotoUrl', 'reportUrl', 'reportInfoCard']),

('report_municipality_notification',
 'Nouveau signalement citoyen — {{reportType}} à {{reportMunicipality}}',
 'Bonjour,<br /><br />Un nouveau signalement citoyen concernant votre municipalité vient d''être approuvé sur mon511.ca.{{reportInfoCard}}Ce courriel est envoyé automatiquement suite à l''approbation du signalement par notre équipe de modération.',
 'Envoyé automatiquement à la municipalité concernée quand un signalement est approuvé (si ses coordonnées sont disponibles).',
 ARRAY['reportType', 'reportDate', 'reportAddress', 'reportMunicipality', 'reportPhotoUrl', 'reportUrl', 'reporterName', 'reportInfoCard']),

('report_approved',
 'Ton signalement a été approuvé — mon511.ca',
 'Bonne nouvelle {{firstName}}!<br /><br />Ton signalement a été approuvé par notre équipe et est maintenant visible publiquement sur la carte de mon511.ca.{{reportInfoCard}}Merci de contribuer à améliorer la sécurité routière au Québec!',
 'Envoyé à l''usager quand son signalement est approuvé par la modération.',
 ARRAY['firstName', 'reportType', 'reportDate', 'reportAddress', 'reportMunicipality', 'reportPhotoUrl', 'reportUrl', 'reportInfoCard']),

('report_rejected',
 'Ton signalement a été refusé — mon511.ca',
 'Bonjour {{firstName}},<br /><br />Ton signalement n''a pas été approuvé par notre équipe.<br /><br /><strong>Motif :</strong> {{rejectReason}}{{reportInfoCard}}Tu as {{correctionDays}} jours pour le corriger — passé ce délai, il sera automatiquement supprimé. Une fois corrigé, il sera automatiquement soumis à une nouvelle révision.',
 'Envoyé à l''usager quand son signalement est refusé, avec le motif et le délai de correction.',
 ARRAY['firstName', 'rejectReason', 'correctionDays', 'reportType', 'reportDate', 'reportAddress', 'reportUrl', 'reportInfoCard']),

('staleness_reminder',
 'Ton signalement est-il toujours valable? — mon511.ca',
 'Bonjour {{firstName}},<br /><br />Ça fait {{warningDays}} jours que ton signalement a été confirmé pour la dernière fois.{{reportInfoCard}}Si le problème existe toujours, confirme-le en un clic — sinon, il sera automatiquement archivé dans {{deadlineDays}} jours.',
 'Envoyé quand un signalement publié n''a reçu aucune confirmation de fraîcheur depuis le délai configuré.',
 ARRAY['firstName', 'warningDays', 'deadlineDays', 'reportType', 'reportAddress', 'reportUrl', 'reportInfoCard']),

('email_changed_old_address',
 'Ton adresse courriel a été changée — mon511.ca',
 'Bonjour,<br /><br />L''adresse courriel de ton compte mon511.ca a été changée pour <strong>{{newEmail}}</strong>.<br /><br />Si tu n''es pas à l''origine de ce changement, contacte-nous immédiatement à <a href="mailto:info@mon511.ca" style="color:#FF5A1F;">info@mon511.ca</a>.',
 'Envoyé à l''ANCIENNE adresse courriel après un changement, pour alerter en cas de changement non autorisé.',
 ARRAY['newEmail']);
