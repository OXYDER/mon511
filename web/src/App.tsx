import { useState } from 'react';
import { getToken, clearToken } from './api';
import MapPage from './pages/MapPage';
import AuthModal from './components/AuthModal';

export default function App() {
  const [authenticated, setAuthenticated] = useState(!!getToken());
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [showAuthModal, setShowAuthModal] = useState(false);

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  }

  function logout() {
    clearToken();
    setAuthenticated(false);
  }

  return (
    <>
      <MapPage
        theme={theme}
        onToggleTheme={toggleTheme}
        onLogout={logout}
        authenticated={authenticated}
        onRequireAuth={() => setShowAuthModal(true)}
      />
      {showAuthModal && (
        <AuthModal
          onClose={() => setShowAuthModal(false)}
          onAuthenticated={() => {
            setAuthenticated(true);
            setShowAuthModal(false);
          }}
        />
      )}
    </>
  );
}
