-- friends.service.ts crée des notifications de type 'friend_request' et
-- 'friend_accepted', absentes de l'énumération notification_type — ça
-- faisait planter l'envoi d'une demande d'ami avec une erreur 500 (la
-- notification faisant partie de la même opération que la demande
-- elle-même).
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'friend_request';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'friend_accepted';
