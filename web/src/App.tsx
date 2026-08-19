import { useEffect, useState } from 'react';
import { getToken, clearToken } from './api';
import MapPage from './pages/MapPage';
import AuthModal from './components/AuthModal';

export default function App() {
  const [authenticated, setAuthenticated] = useState(!!getToken());
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register' | null>(null);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  }

  function logout() {
    clearToken();
    setAuthenticated(false);
  }

  // Déconnexion automatique dès qu'un appel quelconque révèle que le
  // jeton n'est plus valide (voir api.ts) — l'usager ne doit jamais
  // rester dans un état "semi-authentifié" (jeton encore présent mais
  // session réellement terminée côté serveur). api.ts a déjà retiré le
  // jeton lui-même avant de déclencher cet événement ; ici on ne fait
  // que mettre à jour l'état React en conséquence.
  useEffect(() => {
    function handleSessionExpired() {
      setAuthenticated(false);
    }
    window.addEventListener('mon511:session-expired', handleSessionExpired);
    return () => window.removeEventListener('mon511:session-expired', handleSessionExpired);
  }, []);

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
          onClose={() => setAuthModalMode(null)}
          onAuthenticated={() => {
            setAuthenticated(true);
            setAuthModalMode(null);
          }}
        />
      )}
    </>
  );
}
