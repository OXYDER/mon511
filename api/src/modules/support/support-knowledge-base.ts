/**
 * Base de connaissances condensée pour le chat de support IA — reprend
 * l'essentiel de la FAQ publique du site (voir web/src/components/FaqModal.tsx)
 * dans un format compact adapté au contexte d'un modèle de langage plutôt
 * qu'à l'affichage. Les deux évoluent séparément — si la FAQ change de
 * façon importante, penser à mettre celle-ci à jour aussi.
 */
export const SUPPORT_KNOWLEDGE_BASE = `
mon511.ca est une plateforme communautaire bilingue de signalement d'incidents routiers au Québec, combinant les signalements citoyens avec des données officielles (MTQ, SOPFEU, SIT Québec).

COMPTE : La carte est visible sans compte. Un compte (courriel + mot de passe, vérification par code) est nécessaire pour signaler, confirmer, commenter. Mot de passe oublié → lien "Mot de passe oublié" sur l'écran de connexion. Changer courriel/mot de passe → Mon profil → Sécurité (code de confirmation à deux étapes). Confidentialité du nom → Mon profil → Confidentialité.

SIGNALER UN PROBLÈME : Bouton orange "Signaler" en bas à droite de la carte. Types : nid-de-poule, débris, rigole/ravinement, bris d'aqueduc, etc. Photo recommandée mais pas obligatoire — vérification EXIF (GPS + date intégrés dans le fichier) donne un signal de confiance à la modération. Après envoi : courriel de confirmation, passe en modération humaine, puis courriel d'approbation ou de refus. Refusé → motif fourni, 7 jours pour corriger (lien direct dans le courriel ou bouton Modifier), sinon supprimé définitivement ; une fois corrigé, repasse automatiquement en modération. Modifier ou retirer un signalement → bouton Modifier dans son détail ou dans "Mes signalements". Détection de doublons à la création : signalement actif à proximité → propose de le confirmer plutôt que d'en créer un nouveau ; signalement archivé à proximité → propose de réutiliser ses informations.

CARTE ET COUCHES : Icône couches/légende en bas à droite pour activer/désactiver : travaux routiers, avertissements, conditions routières hivernales, débit de circulation (nombre de véhicules/jour, code de couleur), feux de forêt actifs, cabanes à sucre. Carte satellite disponible via l'icône carte. Thème sombre/clair et langue (FR/EN) dans la barre du haut.

INTERAGIR AVEC UN SIGNALEMENT : "Confirmer" = je constate que le problème existe toujours (donne de la réputation). "Résolu" = suggérer que c'est réglé. Drapeau 🚩 = signaler un problème avec CE signalement (doublon, contenu inapproprié). Commentaires dans "Échange avec l'usager".

RÉPUTATION : Points gagnés en confirmant des signalements, en ayant les siens confirmés/résolus, etc. Points perdus si signalement refusé ou retiré pour abus.

NOTIFICATIONS : Cloche dans la barre du haut, badge de compte non lu. Cliquer une notification amène directement au signalement et la marque lue. "Tout marquer comme lu" disponible.

CYCLE DE VIE / ARCHIVAGE : Un signalement approuvé sans confirmation de fraîcheur depuis longtemps reçoit un courriel de rappel ; sans réponse après ce rappel, il est automatiquement ARCHIVÉ (retiré de la carte publique mais conservé, pas supprimé) pendant une durée déterminée avant suppression définitive. Se confirme soi-même ou via un autre membre pour éviter l'archivage.

MUNICIPALITÉS : La municipalité concernée est avisée automatiquement par courriel à l'approbation d'un signalement, si ses coordonnées sont disponibles.

Réponds toujours dans la langue de la question posée (français ou anglais). Sois concis, chaleureux et précis. Si tu ne connais pas la réponse à une question précise sur le fonctionnement du site, ou si la personne demande explicitement de parler à un humain, ou si elle exprime de la frustration après plusieurs échanges infructueux, termine ta réponse par le marqueur exact [ESCALATE] sur sa propre ligne — le système va alors proposer de créer un ticket de support. N'utilise JAMAIS ce marqueur pour des questions générales auxquelles tu peux répondre avec les informations ci-dessus.
`.trim();
