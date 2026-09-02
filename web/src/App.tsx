import { useEffect, useState } from 'react';
import { api, getToken, setToken, clearToken } from './api';
import { closeSocket } from './socket';
import { getStoredLang } from './i18n';
import MapPage from './pages/MapPage';
import AuthModal from './components/AuthModal';
import CookieConsentBanner from './components/CookieConsentBanner';

const COOKIE_CONSENT_KEY = 'mon511_cookie_consent';

// Récupère le jeton transféré depuis l'autre domaine (mon511.ca <->
// my511.ca) lors d'un changement de langue — voir toggleLang() dans
// MapPage.tsx. Exécuté une seule fois, avant même le premier rendu du
// composant (pas dans un effet), pour que l'état `authenticated`
// initial (useState(!!getToken())) reflète déjà la bonne valeur sans
// clignotement (courte apparition de l'état déconnecté avant d'être
// corrigée). Retire immédiatement le paramètre de l'URL — un jeton ne
// devrait jamais rester visible dans la barre d'adresse plus
// longtemps que nécessaire.
(function receiveAuthTransfer() {
  const params = new URLSearchParams(window.location.search);
  const transferredToken = params.get('authTransfer');
  if (transferredToken) {
    setToken(transferredToken);
    params.delete('authTransfer');
    const newSearch = params.toString();
    window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : ''));
  }
})();

export default function App() {
  const [authenticated, setAuthenticated] = useState(!!getToken());
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | null>(null);
  const [lockedEmail, setLockedEmail] = useState<string | undefined>(undefined);
  const [showCookieBanner, setShowCookieBanner] = useState(() => !localStorage.getItem(COOKIE_CONSENT_KEY));

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  }

  function logout() {
    clearToken();
    closeSocket();
    setAuthenticated(false);
  }

  function handleCookieDecision(accepted: boolean) {
    // Le choix lui-même est enregistré peu importe la réponse — sinon la
    // bannière réapparaîtrait à chaque visite même après un refus
    // explicite, ce qui serait plus insistant qu'utile.
    localStorage.setItem(COOKIE_CONSENT_KEY, accepted ? 'accepted' : 'declined');
    setShowCookieBanner(false);
  }

  // Déconnexion automatique dès qu'un appel quelconque révèle que le
  // jeton n'est plus valide (voir api.ts) — l'usager ne doit jamais
  // rester dans un état "semi-authentifié" (jeton encore présent mais
  // session réellement terminée côté serveur). api.ts a déjà retiré le
  // jeton lui-même avant de déclencher cet événement ; ici on ne fait
  // que mettre à jour l'état React en conséquence.
  useEffect(() => {
    function handleSessionExpired() {
      closeSocket();
      setAuthenticated(false);
    }
    window.addEventListener('mon511:session-expired', handleSessionExpired);
    return () => window.removeEventListener('mon511:session-expired', handleSessionExpired);
  }, []);

  // Lien d'invitation municipale ciblant une adresse précise, cliqué
  // par un usager PAS ENCORE connecté — ouvre directement le
  // formulaire d'inscription avec ce courriel pré-rempli et verrouillé
  // (la vraie rédemption du lien, une fois connecté, se fait dans
  // MapPage.tsx, cet effet-ci ne fait que préparer le bon écran
  // d'inscription si nécessaire). Ne touche jamais à l'URL — le lien
  // reste présent pour que MapPage.tsx puisse ensuite le lire et
  // compléter la rédemption une fois l'inscription terminée.
  useEffect(() => {
    if (authenticated) return;
    const token = new URLSearchParams(window.location.search).get('municipalInvite');
    if (!token) return;
    api.get<{ valid: boolean; email?: string }>(`/municipal-portal/invites/${token}/preview`)
      .then((preview) => {
        if (preview.valid && preview.email) {
          setLockedEmail(preview.email);
          setAuthModalMode('register');
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authenticated]);

  return (
    <>
      <MapPage
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={logout}
        authenticated={authenticated}
        onRequireAuth={(mode = 'login') => setAuthModalMode(mode)}
      />
      {authModalMode && (
        <AuthModal
          initialMode={authModalMode}
          lang={getStoredLang()}
          lockedEmail={lockedEmail}
          onClose={() => { setAuthModalMode(null); setLockedEmail(undefined); }}
          onAuthenticated={() => {
            setAuthenticated(true);
            setAuthModalMode(null);
            setLockedEmail(undefined);
          }}
        />
      )}
      {showCookieBanner && (
        <CookieConsentBanner lang={getStoredLang()} onDecision={handleCookieDecision} />
      )}
    </>
  );
}
