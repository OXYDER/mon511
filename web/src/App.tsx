import { useEffect, useState } from 'react';
import { getToken, clearToken } from './api';
import { closeSocket } from './socket';
import { getStoredLang } from './i18n';
import MapPage from './pages/MapPage';
import AuthModal from './components/AuthModal';
import CookieConsentBanner from './components/CookieConsentBanner';
import MunicipalPortalPage from './components/MunicipalPortalEntry';

const COOKIE_CONSENT_KEY = 'mon511_cookie_consent';

export default function App() {
  // Domaine du portail municipal — complètement séparé du client mon511
  // grand public (voir MunicipalPortalEntry.tsx pour le détail). Calculé
  // ici (valeur simple, pas un hook), mais le RETOUR conditionnel se
  // fait seulement après avoir appelé tous les hooks ci-dessous — les
  // retourner plus tôt violerait les règles des hooks React (doivent
  // toujours s'exécuter dans le même ordre à chaque rendu).
  const hostname = window.location.hostname.replace(/^www\./, '');
  const isPortalDomain = hostname === 'portail.mon511.ca' || hostname === 'portal.my511.ca';

  const [authenticated, setAuthenticated] = useState(!!getToken());
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | null>(null);
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

  if (isPortalDomain) {
    return <MunicipalPortalPage lang={hostname === 'portal.my511.ca' ? 'en' : 'fr'} />;
  }

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
          onClose={() => setAuthModalMode(null)}
          onAuthenticated={() => {
            setAuthenticated(true);
            setAuthModalMode(null);
          }}
        />
      )}
      {showCookieBanner && (
        <CookieConsentBanner lang={getStoredLang()} onDecision={handleCookieDecision} />
      )}
    </>
  );
}
