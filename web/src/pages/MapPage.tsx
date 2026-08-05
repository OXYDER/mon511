import { useEffect, useState } from 'react';
import { api, getUserRole, getLocalLayerPrefs, setLocalLayerPrefs, LayerPrefs } from '../api';
import MapView, { MapPin } from '../components/MapView';
import CreateReportModal from '../components/CreateReportModal';
import DetailPanel from '../components/DetailPanel';
import ExternalIncidentPanel from '../components/ExternalIncidentPanel';
import ProfileModal from '../components/ProfileModal';
import ToggleSwitch from '../components/ToggleSwitch';
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
  feedKey: string;
}

type Selection = { type: 'report' | 'external'; id: string } | null;

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
  const [layerPrefs, setLayerPrefs] = useState<LayerPrefs>({ travaux_routiers: false, conditions_hivernales: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  // queryCenter : coordonnée utilisée pour interroger l'API ("près de moi").
  // mapCamera : position de la caméra sur la carte — change aussi quand on
  // clique un pin/une carte de la liste, sans recharger la liste elle-même.
  const [queryCenter, setQueryCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCamera, setMapCamera] = useState<{ lat: number; lng: number } | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);

  const role = getUserRole();
  const isModerator = role !== null && MODERATOR_ROLES.includes(role);

  useEffect(() => {
    if (authenticated) {
      api.get<any>('/users/me').then((me) => {
        if (me.map_layer_preferences) setLayerPrefs(me.map_layer_preferences);
      });
    } else {
      setLayerPrefs(getLocalLayerPrefs());
    }
  }, [authenticated]);

  async function toggleLayer(key: keyof LayerPrefs) {
    const next = { ...layerPrefs, [key]: !layerPrefs[key] };
    setLayerPrefs(next);
    if (authenticated) {
      api.patch('/users/me/map-layers', { [key]: next[key] }).catch(() => {});
    } else {
      setLocalLayerPrefs(next);
    }
  }

  async function loadNearby(lat: number, lng: number, radius = 15000) {
    setLoading(true);
    setError(null);
    try {
      const results = await api.get<Report[]>(`/reports/nearby?lat=${lat}&lng=${lng}&radius=${Math.min(radius, 100000)}`);
      setReports(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les signalements.');
    } finally {
      setLoading(false);
    }
  }

  async function loadOfficialLayer(lat: number, lng: number, radius = 50000) {
    try {
      const results = await api.get<ExternalIncident[]>(
        `/external-data/incidents/nearby?lat=${lat}&lng=${lng}&radius=${Math.min(Math.max(radius, 50000), 150000)}`,
      );
      setExternalIncidents(results);
    } catch {
      setExternalIncidents([]);
    }
  }

  /** Se déclenche quand la carte s'arrête de bouger (glisser ou zoom) — met
   * à jour la liste pour ne montrer que ce qui est visible à l'écran. */
  function handleViewportChange(c: { lat: number; lng: number }, radius: number) {
    setQueryCenter(c);
    loadNearby(c.lat, c.lng, radius);
    loadOfficialLayer(c.lat, c.lng, radius);
  }

  function locateAndLoad() {
    const apply = (lat: number, lng: number) => {
      setQueryCenter({ lat, lng });
      setMapCamera({ lat, lng });
      loadNearby(lat, lng);
      loadOfficialLayer(lat, lng);
    };
    if (!navigator.geolocation) {
      apply(45.4042, -71.8929);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); apply(pos.coords.latitude, pos.coords.longitude); },
      () => { setLocating(false); apply(45.4042, -71.8929); },
    );
  }

  useEffect(() => {
    locateAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (showAdmin) return <AdminPage onClose={() => setShowAdmin(false)} />;

  function openReport(r: Report) {
    setSelection({ type: 'report', id: r.id });
    setMapCamera({ lat: r.latitude, lng: r.longitude });
  }

  function openExternal(inc: ExternalIncident) {
    setSelection({ type: 'external', id: inc.id });
    setMapCamera({ lat: inc.latitude, lng: inc.longitude });
  }

  const reportPins: MapPin[] = reports.map((r) => ({
    id: r.id,
    latitude: r.latitude,
    longitude: r.longitude,
    icon: r.problemTypeIcon ?? '📍',
    colorVar: r.status === 'published_resolved' ? 'resolved' : 'unresolved',
    onClick: () => openReport(r),
  }));

  const visibleExternalIncidents = externalIncidents.filter((inc) =>
    (inc.feedKey === 'mtmd_travaux_routiers' && layerPrefs.travaux_routiers) ||
    (inc.feedKey === 'mtmd_conditions_hivernales' && layerPrefs.conditions_hivernales),
  );

  const officialPins: MapPin[] = visibleExternalIncidents.map((inc) => ({
    id: inc.id,
    latitude: inc.latitude,
    longitude: inc.longitude,
    icon: inc.feedKey === 'mtmd_travaux_routiers' ? '🚧' : '❄️',
    colorVar: 'official',
    onClick: () => openExternal(inc),
  }));

  return (
    <div className="app-full">
      <div className="map-background">
        <MapView
          center={mapCamera}
          pins={[...reportPins, ...officialPins]}
          fullBleed
          theme={theme}
          onViewportChange={handleViewportChange}
        />
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

      <aside className={`filters-panel-float ${selection ? 'mobile-hidden' : ''}`}>
        <h2>Sur la carte</h2>

        <div className="layer-toggle" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>🚧 Travaux routiers</span>
          <ToggleSwitch on={layerPrefs.travaux_routiers} onToggle={() => toggleLayer('travaux_routiers')} />
        </div>
        <div className="layer-toggle" style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>❄️ Conditions routières</span>
          <ToggleSwitch on={layerPrefs.conditions_hivernales} onToggle={() => toggleLayer('conditions_hivernales')} />
        </div>

        {error && <div className="error-banner">{error}</div>}

        <div className="report-list-scroll">
          {loading && <div className="center-msg">Chargement...</div>}
          {!loading && reports.length === 0 && visibleExternalIncidents.length === 0 && !error && (
            <div className="center-msg">Aucun signalement à proximité.<br />Sois le premier à en ajouter un !</div>
          )}

          {visibleExternalIncidents.map((inc) => (
            <div key={inc.id} className="report-card" onClick={() => openExternal(inc)}>
              <div className="rc-icon-hex official">{inc.feedKey === 'mtmd_travaux_routiers' ? '🚧' : '❄️'}</div>
              <div className="rc-body">
                <div className="rc-title">{inc.title ?? inc.sourceName}</div>
                <div className="rc-meta">Source officielle</div>
              </div>
              <span className="pill official">Officiel</span>
            </div>
          ))}

          {reports.map((r) => (
            <div key={r.id} className="report-card" onClick={() => openReport(r)}>
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

      {selection?.type === 'report' && (
        <DetailPanel
          reportId={selection.id}
          onClose={() => setSelection(null)}
          onChanged={() => queryCenter && loadNearby(queryCenter.lat, queryCenter.lng)}
          authenticated={authenticated}
          onRequireAuth={onRequireAuth}
        />
      )}
      {selection?.type === 'external' && (
        <ExternalIncidentPanel incidentId={selection.id} onClose={() => setSelection(null)} />
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
            if (queryCenter) loadNearby(queryCenter.lat, queryCenter.lng);
          }}
        />
      )}

      {showProfileModal && (
        <ProfileModal onClose={() => setShowProfileModal(false)} onLogout={onLogout} />
      )}
    </div>
  );
}
