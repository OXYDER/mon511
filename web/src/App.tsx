import { useState } from 'react';
import { getToken, clearToken } from './api';
import AuthPage from './pages/AuthPage';
import MapPage from './pages/MapPage';

export default function App() {
  const [authenticated, setAuthenticated] = useState(!!getToken());
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  }

  function logout() {
    clearToken();
    setAuthenticated(false);
  }

  if (!authenticated) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <div className="brand-row">
            <span className="brand-mark">511</span>
            <span className="brand-name">mon511.ca</span>
          </div>
          <div className="topbar-actions">
            <button className="icon-btn" onClick={toggleTheme} title="Changer de thème">
              {theme === 'dark' ? '🌙' : '☀️'}
            </button>
          </div>
        </header>
        <AuthPage onAuthenticated={() => setAuthenticated(true)} />
      </div>
    );
  }

  return <MapPage theme={theme} onToggleTheme={toggleTheme} onLogout={logout} />;
}
