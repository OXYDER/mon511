import { useEffect, useState } from 'react';
import { api, getUserRole } from '../api';
import MapView, { MapPin } from '../components/MapView';
import CreateReportModal from '../components/CreateReportModal';
import DetailPanel from '../components/DetailPanel';
import ProfileModal from '../components/ProfileModal';
import AdminPage from './AdminPage';

interface Report {
  id: string;
  status: string;
  description: string | null;
  addressText: string | null;
  problemTypeNameFr: string;
  problemTypeIcon: string | null;
  latitude: number;
  longitude: number;
}

interface ExternalIncident {
  id: string;
  title: string | null;
  sourceName: string;
  provider: string;
  latitude: number;
  longitude: number;
}

interface Props {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout: () => void;
  authenticated: boolean;
  onRequireAuth: () => void;
}

const MODERATOR_ROLES = ['moderator', 'admin', 'super_admin'];

export default function MapPage({ theme, onToggleTheme, onLogout, authenticated, onRequireAuth }: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [externalIncidents, setExternalIncidents] = useState<ExternalIncident[]>([]);
  const [showOfficialLayer, setShowOfficialLayer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);

  const role = getUserRole();
  const isModerator = role !== null && MODERATOR_ROLES.includes(role);

  async function loadNearby(lat: number, lng: number) {
    setLoading(true);
    setError(null);
    setCenter({ lat, lng });
    try {
      const results = await api.get<Report[]>(`/reports/nearby?lat=${lat}&lng=${lng}&radius=15000`);
      setReports(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les signalements.');
    } finally {
      setLoading(false);
    }
  }

  async function loadOfficialLayer(lat: number, lng: number) {
    try {
      const results = await api.get<ExternalIncident[]>(
        `/external-data/incidents/nearby?lat=${lat}&lng=${lng}&radius=15000`,
      );
      setExternalIncidents(results);
    } catch {
      setExternalIncidents([]);
    }
  }

  function toggleOfficialLayer() {
    const next = !showOfficialLayer;
    setShowOfficialLayer(next);
    if (next && center) loadOfficialLayer(center.lat, center.lng);
  }

  function locateAndLoad() {
    if (!navigator.geolocation) {
      loadNearby(45.4042, -71.8929);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        loadNearby(pos.coords.latitude, pos.coords.longitude);
        if (showOfficialLayer) loadOfficialLayer(pos.coords.latitude, pos.coords.longitude);
      },
      () => {
        setLocating(false);
        loadNearby(45.4042, -71.8929);
      },
    );
  }

  useEffect(() => {
    locateAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (showAdmin) return <AdminPage onClose={() => setShowAdmin(false)} />;

  const reportPins: MapPin[] = reports.map((r) => ({
    id: r.id,
    latitude: r.latitude,
    longitude: r.longitude,
    icon: r.problemTypeIcon ?? '📍',
    colorVar: r.status === 'published_resolved' ? 'resolved' : 'unresolved',
    onClick: () => setSelectedReportId(r.id),
  }));

  const officialPins: MapPin[] = showOfficialLayer
    ? externalIncidents.map((inc) => ({
        id: inc.id,
        latitude: inc.latitude,
        longitude: inc.longitude,
        icon: '🏛️',
        colorVar: 'official',
      }))
    : [];

  return (
    <div className="app-full">
      <div className="map-background">
        <MapView center={center} pins={[...reportPins, ...officialPins]} fullBleed theme={theme} />
      </div>

      <header className="topbar-float">
        <div className="brand-row">
          <span className="brand-mark">511</span>
          <span className="brand-name">mon511.ca</span>
        </div>
        <div className="topbar-actions">
          {authenticated ? (
            <>
              {isModerator && (
                <button className="icon-btn" title="Administration" onClick={() => setShowAdmin(true)}>🛡️</button>
              )}
              <button className="icon-btn" title="Mon profil" onClick={() => setShowProfileModal(true)}>👤</button>
            </>
          ) : (
            <>
              <button className="btn-ghost" onClick={onRequireAuth}>Connexion</button>
              <button className="btn-primary" style={{ width: 'auto', padding: '9px 16px' }} onClick={onRequireAuth}>
                S'inscrire
              </button>
            </>
          )}
          <button className="icon-btn" title="Changer de thème" onClick={onToggleTheme}>
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      <aside className={`filters-panel-float ${selectedReportId ? 'mobile-hidden' : ''}`}>
        <h2>Près de vous</h2>

        <div className="layer-toggle" style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 11.5 }}>🏛️ Couche officielle MTMD</span>
          <button className="btn-ghost" onClick={toggleOfficialLayer}>
            {showOfficialLayer ? 'Activée' : 'Désactivée'}
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="report-list-scroll">
          {loading && <div className="center-msg">Chargement...</div>}
          {!loading && reports.length === 0 && (!showOfficialLayer || externalIncidents.length === 0) && !error && (
            <div className="center-msg">Aucun signalement à proximité.<br />Sois le premier à en ajouter un !</div>
          )}

          {showOfficialLayer &&
            externalIncidents.map((inc) => (
              <div key={inc.id} className="report-card" style={{ cursor: 'default' }}>
                <div className="rc-icon-hex official">🏛️</div>
                <div className="rc-body">
                  <div className="rc-title">{inc.title ?? inc.sourceName}</div>
                  <div className="rc-meta">Source officielle</div>
                </div>
                <span className="pill official">Officiel</span>
              </div>
            ))}

          {reports.map((r) => (
            <div key={r.id} className="report-card" onClick={() => setSelectedReportId(r.id)}>
              <div className={`rc-icon-hex ${r.status === 'published_resolved' ? 'resolved' : ''}`}>
                {r.problemTypeIcon ?? '📍'}
              </div>
              <div className="rc-body">
                <div className="rc-title">{r.problemTypeNameFr}</div>
                <div className="rc-meta">{r.addressText ?? 'Localisation GPS'}</div>
              </div>
              <span className={`pill ${r.status === 'published_resolved' ? 'resolved' : 'unresolved'}`}>
                {r.status === 'published_resolved' ? 'Résolu' : 'Non résolu'}
              </span>
            </div>
          ))}
        </div>
      </aside>

      {selectedReportId && (
        <DetailPanel
          reportId={selectedReportId}
          onClose={() => setSelectedReportId(null)}
          onChanged={() => center && loadNearby(center.lat, center.lng)}
          authenticated={authenticated}
          onRequireAuth={onRequireAuth}
        />
      )}

      <button className="locate-btn-float" onClick={locateAndLoad} disabled={locating} title="Centrer sur ma position">
        {locating ? '⏳' : '🎯'}
      </button>

      <button className="fab" onClick={() => (authenticated ? setShowCreateModal(true) : onRequireAuth())}>
        <span style={{ fontSize: 18 }}>➕</span>
        <span>Signaler</span>
      </button>

      <div className="stats-badge-float">
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-resolved)' }} />
        <strong>{reports.length}</strong>
        <span>signalement{reports.length !== 1 ? 's' : ''} actif{reports.length !== 1 ? 's' : ''}</span>
      </div>

      {showCreateModal && (
        <CreateReportModal
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            if (center) loadNearby(center.lat, center.lng);
          }}
        />
      )}

      {showProfileModal && (
        <ProfileModal onClose={() => setShowProfileModal(false)} onLogout={onLogout} />
      )}
    </div>
  );
}
