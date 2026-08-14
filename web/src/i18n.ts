export type Lang = 'fr' | 'en';

const dict = {
  connexion: { fr: 'Connexion', en: 'Log in' },
  sinscrire: { fr: "S'inscrire", en: 'Sign up' },
  creerCompte: { fr: 'Créer un compte', en: 'Create an account' },
  monProfil: { fr: 'Mon profil', en: 'My profile' },
  administration: { fr: 'Administration', en: 'Administration' },
  changerTheme: { fr: 'Changer de thème', en: 'Toggle theme' },
  surLaCarte: { fr: 'Recherche & résultats', en: 'Search & results' },
  legende: { fr: 'Légende', en: 'Legend' },
  filtres: { fr: 'Filtres', en: 'Filters' },
  rechercher: { fr: 'Chercher une ville ou un signalement...', en: 'Search a city or a report...' },
  travauxRoutiers: { fr: 'Travaux routiers', en: 'Roadworks' },
  conditionsRoutieres: { fr: 'Conditions routières', en: 'Road conditions' },
  aucunSignalement: { fr: 'Aucun signalement visible.', en: 'No visible reports.' },
  soisLePremier: { fr: 'Sois le premier à en ajouter un !', en: 'Be the first to add one!' },
  chargement: { fr: 'Chargement...', en: 'Loading...' },
  localiser: { fr: 'Localiser', en: 'Locate me' },
  signaler: { fr: 'Signaler', en: 'Report' },
  nonResolu: { fr: 'Non résolu', en: 'Unresolved' },
  resolu: { fr: 'Résolu', en: 'Resolved' },
  aVenir: { fr: 'À venir', en: 'Upcoming' },
  enCours: { fr: 'En cours', en: 'Ongoing' },
  termine: { fr: 'Terminé', en: 'Completed' },
  officiel: { fr: 'Officiel', en: 'Official' },
  tous: { fr: 'Tous', en: 'All' },
  statut: { fr: 'Statut', en: 'Status' },
  type: { fr: 'Type', en: 'Type' },
  fermer: { fr: 'Fermer', en: 'Close' },
  seConnecter: { fr: 'Se connecter', en: 'Log in' },
  creerMonCompte: { fr: 'Créer mon compte', en: 'Create my account' },
  courriel: { fr: 'Courriel', en: 'Email' },
  motDePasse: { fr: 'Mot de passe', en: 'Password' },
  prenom: { fr: 'Prénom', en: 'First name' },
  nouveauSignalement: { fr: 'Nouveau signalement', en: 'New report' },
  seDeconnecter: { fr: 'Se déconnecter', en: 'Log out' },
} as const;

export type TranslationKey = keyof typeof dict;

export function t(key: TranslationKey, lang: Lang): string {
  return dict[key][lang];
}

/** Choisit le nom français ou anglais d'un type de problème (ou toute
 * paire nameFr/nameEn) selon la langue active — avec repli sur le
 * français si jamais l'anglais est manquant pour un type donné. */
export function pickName(nameFr: string, nameEn: string | null | undefined, lang: Lang): string {
  return lang === 'en' && nameEn ? nameEn : nameFr;
}

const LANG_KEY = 'mon511_lang';

export function getStoredLang(): Lang {
  const v = localStorage.getItem(LANG_KEY);
  if (v === 'en' || v === 'fr') return v;
  // Aucun choix manuel encore fait — la langue par défaut suit le nom de
  // domaine utilisé pour visiter le site (my511.ca → anglais, mon511.ca
  // ou tout autre cas → français). Un choix manuel (via setStoredLang)
  // prend toujours le dessus par la suite, peu importe le domaine.
  return window.location.hostname.startsWith('my511.') ? 'en' : 'fr';
}

export function setStoredLang(lang: Lang) {
  localStorage.setItem(LANG_KEY, lang);
}

/** Temps écoulé depuis une date, en jours/mois/années — affiché à côté de
 * la date elle-même partout où l'âge d'un signalement importe (ex.
 * "il y a 12 jours"). */
export function timeAgo(dateStr: string, lang: Lang): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMs / 3600000);
  const days = Math.floor(diffMs / 86400000);

  if (minutes < 1) return lang === 'fr' ? "à l'instant" : 'just now';
  if (minutes < 60) return lang === 'fr' ? `il y a ${minutes} min` : `${minutes} min ago`;
  if (hours < 24) return lang === 'fr' ? `il y a ${hours} h` : `${hours}h ago`;
  if (days === 1) return lang === 'fr' ? 'il y a 1 jour' : '1 day ago';
  if (days < 30) return lang === 'fr' ? `il y a ${days} jours` : `${days} days ago`;

  const months = Math.floor(days / 30);
  if (months === 1) return lang === 'fr' ? 'il y a 1 mois' : '1 month ago';
  if (months < 12) return lang === 'fr' ? `il y a ${months} mois` : `${months} months ago`;

  const years = Math.floor(months / 12);
  if (years === 1) return lang === 'fr' ? 'il y a 1 an' : '1 year ago';
  return lang === 'fr' ? `il y a ${years} ans` : `${years} years ago`;
}

/** Classe CSS de pastille selon le statut d'un signalement — centralisé
 * pour que les couleurs restent cohérentes partout où un statut
 * s'affiche, plutôt que de réécrire la même logique à chaque endroit. */
export function statusPillClass(status: string): string {
  switch (status) {
    case 'published_resolved': return 'resolved';
    case 'published_unresolved': return 'unresolved';
    case 'pending_moderation': return 'pending_moderation';
    case 'rejected': return 'rejected';
    case 'withdrawn': return 'withdrawn';
    default: return '';
  }
}
