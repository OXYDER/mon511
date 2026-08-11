import { useState } from 'react';

interface Props {
  onClose: () => void;
  lang: 'fr' | 'en';
}

interface QA {
  q: string;
  qEn: string;
  a: string;
  aEn: string;
}

interface Section {
  title: string;
  titleEn: string;
  items: QA[];
}

const SECTIONS: Section[] = [
  {
    title: 'Général',
    titleEn: 'General',
    items: [
      {
        q: "Qu'est-ce que mon511.ca?",
        qEn: 'What is mon511.ca?',
        a: "mon511.ca est une plateforme communautaire bilingue de signalement d'incidents routiers au Québec. Elle combine les signalements des citoyens avec les données officielles du ministère des Transports et de la Mobilité durable (MTQ), de la SOPFEU et du SIT Québec, le tout sur une seule carte interactive.",
        aEn: "mon511.ca is a bilingual community platform for reporting road incidents in Quebec. It combines citizen reports with official data from the Ministère des Transports et de la Mobilité durable (MTQ), SOPFEU, and SIT Québec, all on a single interactive map.",
      },
      {
        q: "Ai-je besoin d'un compte pour voir la carte?",
        qEn: 'Do I need an account to view the map?',
        a: "Non — la carte et les signalements publiés sont visibles par tout le monde, sans connexion. Un compte est seulement nécessaire pour créer un signalement, le confirmer, le commenter, ou interagir avec la communauté.",
        aEn: "No — the map and published reports are visible to everyone, no login required. An account is only needed to create a report, confirm one, comment, or interact with the community.",
      },
      {
        q: 'Comment changer la langue du site?',
        qEn: 'How do I change the site language?',
        a: "Clique sur le bouton « FR » ou « EN » dans la barre du haut, à côté des autres icônes. Ton choix est mémorisé pour tes prochaines visites.",
        aEn: 'Click the "FR" or "EN" button in the top bar, next to the other icons. Your choice is remembered for future visits.',
      },
      {
        q: 'Comment changer entre le thème sombre et clair?',
        qEn: 'How do I switch between dark and light theme?',
        a: "Clique sur l'icône de lune/soleil dans la barre du haut.",
        aEn: 'Click the moon/sun icon in the top bar.',
      },
      {
        q: 'Comment utiliser la carte satellite?',
        qEn: 'How do I use the satellite map?',
        a: "Clique sur l'icône de carte (🗺️) en bas à droite de l'écran, puis choisis « Satellite » plutôt que « Par défaut ».",
        aEn: 'Click the map icon (🗺️) at the bottom right of the screen, then choose "Satellite" instead of "Default".',
      },
    ],
  },
  {
    title: 'Créer un compte et se connecter',
    titleEn: 'Creating an account and logging in',
    items: [
      {
        q: 'Comment créer un compte?',
        qEn: 'How do I create an account?',
        a: "Clique sur l'icône de profil dans la barre du haut, puis « Créer un compte ». Un courriel de vérification te sera envoyé — tu dois cliquer sur le lien ou entrer le code reçu pour activer ton compte avant de pouvoir te connecter.",
        aEn: 'Click the profile icon in the top bar, then "Create an account". A verification email will be sent — you must click the link or enter the code received to activate your account before logging in.',
      },
      {
        q: "Je n'ai pas reçu mon courriel de vérification, que faire?",
        qEn: "I didn't receive my verification email, what do I do?",
        a: 'Vérifie ton dossier de courriels indésirables (pourriels). Si le problème persiste après quelques minutes, contacte info@mon511.ca.',
        aEn: 'Check your spam/junk folder. If the problem persists after a few minutes, contact info@mon511.ca.',
      },
      {
        q: "J'ai oublié mon mot de passe, comment le réinitialiser?",
        qEn: 'I forgot my password, how do I reset it?',
        a: "Sur l'écran de connexion, clique sur « Mot de passe oublié ». Tu recevras un courriel avec un lien pour en choisir un nouveau. Pour des raisons de sécurité, la réponse est la même que ton compte existe ou non.",
        aEn: 'On the login screen, click "Forgot password". You will receive an email with a link to choose a new one. For security reasons, the response is the same whether or not your account exists.',
      },
      {
        q: 'Comment changer mon courriel ou mon mot de passe?',
        qEn: 'How do I change my email or password?',
        a: "Dans « Mon profil » (icône de profil dans la barre du haut), onglet « Sécurité ». Le changement de courriel se fait en deux étapes : tu reçois un code de confirmation à ta nouvelle adresse, et un avis à l'ancienne.",
        aEn: 'In "My profile" (profile icon in the top bar), "Security" tab. Changing your email is a two-step process: you receive a confirmation code at your new address, and a notice at the old one.',
      },
      {
        q: 'Comment contrôler qui voit mon nom sur mes signalements?',
        qEn: 'How do I control who sees my name on my reports?',
        a: "Dans « Mon profil », onglet « Confidentialité », tu peux choisir d'afficher ton nom de famille en entier, seulement l'initiale, ou de le cacher complètement. Ton prénom reste toujours visible sur tes signalements publiés.",
        aEn: 'In "My profile", "Privacy" tab, you can choose to show your last name in full, just the initial, or hide it completely. Your first name always remains visible on your published reports.',
      },
    ],
  },
  {
    title: 'Signaler un problème',
    titleEn: 'Reporting a problem',
    items: [
      {
        q: 'Comment signaler un problème?',
        qEn: 'How do I report a problem?',
        a: "Clique sur le bouton orange « Signaler » en bas à droite de la carte. Choisis le type de problème, confirme ou ajuste l'emplacement, ajoute une description et des photos si possible, puis envoie.",
        aEn: 'Click the orange "Report" button at the bottom right of the map. Choose the problem type, confirm or adjust the location, add a description and photos if possible, then submit.',
      },
      {
        q: 'Quels types de problèmes puis-je signaler?',
        qEn: 'What types of problems can I report?',
        a: "Nid-de-poule, débris sur la chaussée, rigole/ravinement, bris d'aqueduc, et d'autres catégories liées à l'état des routes. La liste complète apparaît dans le formulaire de signalement.",
        aEn: 'Pothole, debris on the road, ditch/gully erosion, water main break, and other categories related to road conditions. The full list appears in the report form.',
      },
      {
        q: 'Dois-je obligatoirement ajouter une photo?',
        qEn: 'Do I have to add a photo?',
        a: "Non, ce n'est pas obligatoire, mais fortement recommandé — ça aide grandement l'équipe de modération à évaluer rapidement ton signalement, et améliore la fiabilité perçue par les autres usagers.",
        aEn: "No, it's not mandatory, but strongly recommended — it greatly helps the moderation team quickly assess your report, and improves how reliable it looks to other users.",
      },
      {
        q: "Comment fonctionne la vérification par photo?",
        qEn: 'How does photo verification work?',
        a: "Le site lit les métadonnées GPS et la date intégrées directement dans le fichier photo (EXIF), extraites côté serveur pour éviter toute manipulation. Si la position de la photo correspond à l'emplacement du signalement et que la photo est récente, un signal de confiance plus élevé est affiché à la modération. Sans données GPS dans la photo (ex. capture d'écran, photo envoyée par messagerie), la vérification est simplement marquée « non vérifiable » — ce n'est pas pénalisant, juste moins d'information disponible.",
        aEn: "The site reads the GPS and date metadata embedded directly in the photo file (EXIF), extracted server-side to prevent tampering. If the photo's location matches the report location and the photo is recent, a higher confidence signal is shown to moderators. Without GPS data in the photo (e.g. screenshot, photo sent via messaging apps), verification is simply marked as \"unverifiable\" — this isn't held against you, there's just less information available.",
      },
      {
        q: 'Que se passe-t-il après avoir envoyé mon signalement?',
        qEn: 'What happens after I submit my report?',
        a: "Il passe d'abord par une modération humaine avant d'être visible publiquement sur la carte. Tu reçois un courriel de confirmation d'envoi, puis un autre une fois la décision prise (approuvé ou refusé). En attendant, tu peux le voir toi-même sur la carte avec un contour pointillé.",
        aEn: 'It first goes through human moderation before becoming publicly visible on the map. You receive a confirmation email upon submission, then another once a decision is made (approved or rejected). In the meantime, you can see it yourself on the map with a dashed outline.',
      },
      {
        q: 'Mon signalement a été refusé, que faire?',
        qEn: 'My report was rejected, what do I do?',
        a: "Le courriel de refus indique le motif exact. Tu as un délai (généralement 7 jours) pour le corriger — soit via le lien direct dans le courriel, soit via le bouton « Modifier » dans le détail de ton signalement ou dans « Mes signalements ». Une fois corrigé, il repasse automatiquement par une nouvelle révision. Passé ce délai sans correction, il est supprimé définitivement.",
        aEn: 'The rejection email states the exact reason. You have a set period (usually 7 days) to correct it — either via the direct link in the email, or via the "Edit" button in your report\'s details or in "My reports". Once corrected, it automatically goes through a new review. If not corrected in time, it is permanently deleted.',
      },
      {
        q: "Puis-je modifier mon signalement après l'avoir envoyé?",
        qEn: 'Can I edit my report after submitting it?',
        a: "Oui, tant qu'il t'appartient. Utilise le bouton « Modifier » dans le détail du signalement, ou dans « Mes signalements ». Tu peux ajuster la description, l'adresse, le type de problème, et gérer les photos.",
        aEn: 'Yes, as long as it belongs to you. Use the "Edit" button in the report details, or in "My reports". You can adjust the description, address, problem type, and manage photos.',
      },
      {
        q: 'Puis-je retirer/annuler mon signalement?',
        qEn: 'Can I withdraw/cancel my report?',
        a: "Oui, dans « Mes signalements », tu peux le retirer à tout moment. Un signalement retiré n'apparaît plus sur la carte publique.",
        aEn: 'Yes, in "My reports", you can withdraw it at any time. A withdrawn report no longer appears on the public map.',
      },
      {
        q: 'Le site va-t-il détecter si je signale un problème déjà existant?',
        qEn: 'Will the site detect if I report an existing problem?',
        a: "Oui — si un signalement actif ou archivé existe déjà tout près de l'endroit choisi, le formulaire te le propose avant l'envoi. S'il est actif, tu peux simplement le confirmer plutôt que d'en créer un nouveau. S'il est archivé, tu peux réutiliser ses informations comme point de départ. Dans les deux cas, tu peux quand même continuer ton propre signalement si tu juges que c'est vraiment différent.",
        aEn: "Yes — if an active or archived report already exists near the chosen location, the form suggests it before you submit. If it's active, you can simply confirm it instead of creating a new one. If it's archived, you can reuse its information as a starting point. Either way, you can still continue with your own report if you feel it's genuinely different.",
      },
    ],
  },
  {
    title: 'La carte et les couches de données',
    titleEn: 'The map and data layers',
    items: [
      {
        q: 'Que représentent les différentes icônes sur la carte?',
        qEn: 'What do the different icons on the map represent?',
        a: "Chaque type de problème a sa propre icône et couleur — consulte la légende (icône 🎚️ en bas à droite) pour la liste complète. Les pins avec contour pointillé sont des signalements en attente de modération, visibles seulement par leur auteur.",
        aEn: "Each problem type has its own icon and color — check the legend (🎚️ icon at the bottom right) for the full list. Pins with a dashed outline are reports pending moderation, visible only to their author.",
      },
      {
        q: 'Quelles sont les couches de données officielles disponibles?',
        qEn: 'What official data layers are available?',
        a: "Travaux routiers, avertissements (fermetures, incidents), conditions routières hivernales, débit de circulation, feux de forêt actifs (SOPFEU), et cabanes à sucre (SIT Québec). Active/désactive-les via l'icône 🗂️ (Détails de la carte) en bas à droite.",
        aEn: "Roadworks, advisories (closures, incidents), winter road conditions, traffic volume, active forest fires (SOPFEU), and sugar shacks (SIT Québec). Toggle them via the 🗂️ icon (Map details) at the bottom right.",
      },
      {
        q: "C'est quoi le débit de circulation?",
        qEn: 'What is traffic volume?',
        a: "Une couche affichant le nombre moyen de véhicules par jour sur différents segments de route (données du MTQ), avec un code de couleur du vert (faible circulation) au rouge (très élevé). L'échelle est indicative, pas une classification officielle du MTQ.",
        aEn: "A layer showing the average number of vehicles per day on different road segments (MTQ data), color-coded from green (low traffic) to red (very high). The scale is indicative, not an official MTQ classification.",
      },
      {
        q: 'Pourquoi je ne vois pas certaines couches sur la carte?',
        qEn: "Why can't I see certain layers on the map?",
        a: "La plupart des couches affichent seulement ce qui est visible dans la zone actuelle de la carte — déplace-toi ou dézoome pour voir plus de résultats. Assure-toi aussi que la couche est bien activée dans le menu « Détails de la carte ».",
        aEn: "Most layers only show what's visible in the map's current view — pan or zoom out to see more results. Also make sure the layer is enabled in the \"Map details\" menu.",
      },
      {
        q: 'Comment rechercher une ville ou une adresse?',
        qEn: 'How do I search for a city or address?',
        a: "Utilise la barre de recherche en haut à gauche. Tes recherches récentes sont sauvegardées et apparaissent dès que tu cliques dans le champ vide.",
        aEn: 'Use the search bar at the top left. Your recent searches are saved and appear as soon as you click into the empty field.',
      },
    ],
  },
  {
    title: 'Interagir avec un signalement',
    titleEn: 'Interacting with a report',
    items: [
      {
        q: "Comment confirmer qu'un problème existe toujours?",
        qEn: 'How do I confirm a problem still exists?',
        a: "Ouvre le signalement sur la carte et clique sur « 👍 Confirmer ». Chaque confirmation aide la communauté et rapporte un peu de réputation — à toi et à l'auteur du signalement.",
        aEn: 'Open the report on the map and click "👍 Confirm". Each confirmation helps the community and grants a bit of reputation — to you and to the report\'s author.',
      },
      {
        q: "Comment indiquer qu'un problème est résolu?",
        qEn: 'How do I indicate a problem has been resolved?',
        a: "Dans le détail du signalement, clique sur « ✔ Résolu » pour suggérer que le problème n'existe plus. La suggestion est prise en compte par le système.",
        aEn: 'In the report details, click "✔ Resolved" to suggest the problem no longer exists. The suggestion is factored in by the system.',
      },
      {
        q: 'Comment signaler un problème avec un signalement (doublon, contenu inapproprié)?',
        qEn: 'How do I flag an issue with a report (duplicate, inappropriate content)?',
        a: "Clique sur l'icône 🚩 dans le détail du signalement et précise la raison. L'équipe de modération va l'examiner.",
        aEn: 'Click the 🚩 icon in the report details and specify the reason. The moderation team will review it.',
      },
      {
        q: 'Puis-je laisser un commentaire sur un signalement?',
        qEn: 'Can I leave a comment on a report?',
        a: "Oui, dans la section « Échange avec l'usager » du détail d'un signalement. Utile pour poser une question à l'auteur ou ajouter un détail complémentaire.",
        aEn: 'Yes, in the "Message the user" section of a report\'s details. Useful for asking the author a question or adding extra context.',
      },
    ],
  },
  {
    title: 'Mes signalements et ma réputation',
    titleEn: 'My reports and my reputation',
    items: [
      {
        q: 'Où voir la liste de mes signalements?',
        qEn: 'Where can I see the list of my reports?',
        a: "Clique sur l'icône de profil dans la barre du haut, puis « Mes signalements ». Tu peux y filtrer par statut, par type, ou par municipalité, et trier les résultats.",
        aEn: 'Click the profile icon in the top bar, then "My reports". You can filter by status, type, or municipality, and sort the results.',
      },
      {
        q: "C'est quoi le système de réputation?",
        qEn: 'What is the reputation system?',
        a: "Chaque compte accumule des points selon ses contributions : confirmer des signalements, avoir ses propres signalements confirmés par d'autres ou résolus, suggérer une résolution qui s'avère exacte, etc. À l'inverse, un signalement refusé ou retiré pour abus fait perdre des points. Ton score de réputation est visible sur ton profil public.",
        aEn: "Every account earns points based on its contributions: confirming reports, having your own reports confirmed by others or resolved, suggesting a correct resolution, etc. Conversely, a rejected report or one removed for abuse costs points. Your reputation score is visible on your public profile.",
      },
    ],
  },
  {
    title: 'Notifications',
    titleEn: 'Notifications',
    items: [
      {
        q: 'Comment fonctionnent les notifications?',
        qEn: 'How do notifications work?',
        a: "L'icône de cloche dans la barre du haut affiche un pastille avec le nombre de notifications non lues. Clique dessus pour voir la liste — chaque notification liée à un signalement montre un aperçu (type, adresse, photo). Cliquer sur une notification t'amène directement au signalement concerné et la marque comme lue.",
        aEn: 'The bell icon in the top bar shows a badge with the number of unread notifications. Click it to see the list — each notification linked to a report shows a preview (type, address, photo). Clicking a notification takes you directly to the related report and marks it as read.',
      },
      {
        q: 'Comment tout marquer comme lu?',
        qEn: 'How do I mark everything as read?',
        a: "Un bouton « Tout marquer comme lu » apparaît en haut du panneau de notifications s'il y en a des non lues.",
        aEn: 'A "Mark all as read" button appears at the top of the notifications panel if there are unread ones.',
      },
    ],
  },
  {
    title: "Cycle de vie d'un signalement et archivage",
    titleEn: 'Report lifecycle and archiving',
    items: [
      {
        q: 'Pourquoi mon signalement a disparu de la carte alors qu\'il était approuvé?',
        qEn: 'Why did my approved report disappear from the map?',
        a: "S'il n'a reçu aucune confirmation de fraîcheur (ni de toi, ni d'un autre membre) pendant une longue période, un courriel de rappel t'est envoyé pour demander si le problème existe toujours. Sans réponse après ce rappel, le signalement est automatiquement archivé — retiré de la carte publique, mais pas supprimé.",
        aEn: "If it hasn't received a freshness confirmation (from you or another member) for a long period, a reminder email is sent asking if the problem still exists. Without a response after that reminder, the report is automatically archived — removed from the public map, but not deleted.",
      },
      {
        q: "Qu'est-ce qu'un signalement archivé, et est-ce définitif?",
        qEn: 'What is an archived report, and is it permanent?',
        a: "Un signalement archivé n'est plus visible sur la carte publique, mais reste conservé (informations et photos) pendant une durée déterminée, avant suppression définitive. S'il réapparaît (quelqu'un signale le même problème au même endroit), le système peut proposer de réutiliser ses informations.",
        aEn: "An archived report is no longer visible on the public map, but is kept (information and photos) for a set period before permanent deletion. If it comes back (someone reports the same problem in the same spot), the system may suggest reusing its information.",
      },
      {
        q: 'Comment éviter que mon signalement soit archivé?',
        qEn: 'How do I prevent my report from being archived?',
        a: "Confirme-le toi-même de temps en temps (bouton « Confirmer » dans son détail), ou demande à d'autres membres de le faire s'ils constatent que le problème existe toujours. Chaque confirmation remet le compte à rebours à zéro.",
        aEn: 'Confirm it yourself from time to time (the "Confirm" button in its details), or ask other members to do so if they notice the problem still exists. Each confirmation resets the countdown.',
      },
    ],
  },
  {
    title: 'Municipalités',
    titleEn: 'Municipalities',
    items: [
      {
        q: 'Est-ce que ma municipalité est avisée de mon signalement?',
        qEn: 'Is my municipality notified of my report?',
        a: "Quand un signalement est approuvé, le système tente d'aviser automatiquement la municipalité concernée par courriel, si ses coordonnées sont disponibles dans notre répertoire (basé sur les données ouvertes du MAMH). Le statut d'avis apparaît dans le détail du signalement.",
        aEn: "When a report is approved, the system attempts to automatically notify the relevant municipality by email, if its contact information is available in our directory (based on MAMH open data). The notification status appears in the report's details.",
      },
    ],
  },
];

export default function FaqModal({ onClose, lang }: Props) {
  const [openIndex, setOpenIndex] = useState<string | null>(null);

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: 480 }}>
        <div className="modal-head">
          <div className="modal-title">{lang === 'fr' ? 'Foire aux questions' : 'Frequently Asked Questions'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
          {SECTIONS.map((section, si) => (
            <div key={si}>
              <div className="section-label" style={si === 0 ? { marginTop: 0, paddingTop: 0, borderTop: 'none' } : undefined}>
                {lang === 'fr' ? section.title : section.titleEn}
              </div>
              {section.items.map((qa, qi) => {
                const key = `${si}-${qi}`;
                const isOpen = openIndex === key;
                return (
                  <div key={key} style={{ borderBottom: '1px solid var(--panel-border)' }}>
                    <div
                      onClick={() => setOpenIndex(isOpen ? null : key)}
                      style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '11px 2px', cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                      }}
                    >
                      <span>{lang === 'fr' ? qa.q : qa.qEn}</span>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0, marginLeft: 8 }}>{isOpen ? '−' : '+'}</span>
                    </div>
                    {isOpen && (
                      <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.6, padding: '0 2px 12px' }}>
                        {lang === 'fr' ? qa.a : qa.aEn}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}

          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 20, textAlign: 'center' }}>
            {lang === 'fr' ? "Ta question n'est pas ici?" : "Your question isn't here?"}{' '}
            <a href="mailto:info@mon511.ca" style={{ color: 'var(--accent-signal)' }}>info@mon511.ca</a>
          </div>
        </div>
      </div>
    </div>
  );
}
