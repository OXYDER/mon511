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

const LANG_KEY = 'mon511_lang';

export function getStoredLang(): Lang {
  const v = localStorage.getItem(LANG_KEY);
  return v === 'en' ? 'en' : 'fr';
}

export function setStoredLang(lang: Lang) {
  localStorage.setItem(LANG_KEY, lang);
}
