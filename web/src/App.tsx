import { useState } from 'react';
import { getToken, clearToken } from './api';
import AuthPage from './pages/AuthPage';
import MapPage from './pages/MapPage';
import CreateReportPage from './pages/CreateReportPage';
import ReportDetailPage from './pages/ReportDetailPage';
import ProfilePage from './pages/ProfilePage';

type View = 'map' | 'create' | 'detail' | 'profile';

export default function App() {
  const [authenticated, setAuthenticated] = useState(!!getToken());
  const [view, setView] = useState<View>('map');
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  function toggleTheme() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    document.documentElement.setAttribute('data-theme', next);
  }

  const themeToggleBtn = (
    <button className="icon-btn" onClick={toggleTheme} title="Changer de thème">
      {theme === 'dark' ? '🌙' : '☀️'}
    </button>
  );

  if (!authenticated) {
    return (
      <div className="app-shell">
        <header className="topbar">
          <div className="brand-row">
            <span className="brand-mark">511</span>
            <span className="brand-name">mon511.ca</span>
          </div>
          <div className="topbar-actions">{themeToggleBtn}</div>
        </header>
        <AuthPage onAuthenticated={() => setAuthenticated(true)} />
      </div>
    );
  }

  function openReport(id: string) {
    setSelectedReportId(id);
    setView('detail');
  }

  function logout() {
    clearToken();
    setAuthenticated(false);
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-row">
          <span className="brand-mark">511</span>
          <span className="brand-name">mon511.ca</span>
        </div>
        <div className="topbar-actions">{themeToggleBtn}</div>
      </header>

      {view === 'map' && <MapPage onOpenReport={openReport} />}
      {view === 'create' && <CreateReportPage onCreated={() => setView('map')} />}
      {view === 'detail' && selectedReportId && (
        <ReportDetailPage reportId={selectedReportId} onBack={() => setView('map')} />
      )}
      {view === 'profile' && <ProfilePage onLogout={logout} />}

      <nav className="bottom-nav">
        <button className={`nav-tab ${view === 'map' ? 'active' : ''}`} onClick={() => setView('map')}>
          <span className="nt-ico">🗺️</span>
          <span>Carte</span>
        </button>
        <button className={`nav-tab ${view === 'create' ? 'active' : ''}`} onClick={() => setView('create')}>
          <span className="nt-ico">➕</span>
          <span>Signaler</span>
        </button>
        <button className={`nav-tab ${view === 'profile' ? 'active' : ''}`} onClick={() => setView('profile')}>
          <span className="nt-ico">👤</span>
          <span>Profil</span>
        </button>
      </nav>
    </div>
  );
}
