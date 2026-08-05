import { useEffect, useMemo, useState } from 'react';
import { api, getUserRole, getLocalLayerPrefs, setLocalLayerPrefs, LayerPrefs } from '../api';
import { t, Lang, getStoredLang, setStoredLang } from '../i18n';
import { searchCity } from '../geocoding';
import MapView, { MapPin, RoadLineFeature } from '../components/MapView';
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
  problemTypeId?: string;
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
  debut: string | null;
  fin: string | null;
  roadConditionColorCode: string | null;
  roadConditionLabel: string | null;
  raw_geometry: any;
}

interface ProblemType {
  id: string;
  name_fr: string;
  icon: string | null;
}

function parseMtmdDate(value: string | null): Date | null {
  if (!value) return null;
  const parsed = new Date(value.replace(/\//g, '-'));
  return isNaN(parsed.getTime()) ? null : parsed;
}

function travauxStatus(debut: string | null, fin: string | null, lang: Lang): { label: string; color: string } {
  const now = new Date();
  const d = parseMtmdDate(debut);
  const f = parseMtmdDate(fin);
  if (d && now < d) return { label: t('aVenir', lang), color: 'var(--official-blue)' };
  if (f && now > f) return { label: t('termine', lang), color: 'var(--text-muted)' };
  return { label: t('enCours', lang), color: 'var(--status-unresolved)' };
}

function formatMtmdDate(value: string | null, lang: Lang): string {
  const d = parseMtmdDate(value);
  return d ? d.toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
}

type Selection = { type: 'report' | 'external'; id: string } | null;
type PanelView = 'list' | 'legend' | 'filters' | null;

interface Props {
  theme: 'dark' | 'light';
  onToggleTheme: () => void;
  onLogout: () => void;
  authenticated: boolean;
  onRequireAuth: (mode?: 'login' | 'register') => void;
}

const MODERATOR_ROLES = ['moderator', 'admin', 'super_admin'];

export default function MapPage({ theme, onToggleTheme, onLogout, authenticated, onRequireAuth }: Props) {
  const [lang, setLang] = useState<Lang>(getStoredLang());
  const [reports, setReports] = useState<Report[]>([]);
  const [externalIncidents, setExternalIncidents] = useState<ExternalIncident[]>([]);
  const [problemTypes, setProblemTypes] = useState<ProblemType[]>([]);
  const [layerPrefs, setLayerPrefs] = useState<LayerPrefs>({ travaux_routiers: false, conditions_hivernales: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [queryCenter, setQueryCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCamera, setMapCamera] = useState<{ lat: number; lng: number } | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [panelView, setPanelView] = useState<PanelView>('list');

  const [searchText, setSearchText] = useState('');
  const [filterTypeIds, setFilterTypeIds] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<'all' | 'unresolved' | 'resolved'>('all');

  const role = getUserRole();
  const isModerator = role !== null && MODERATOR_ROLES.includes(role);

  function toggleLang() {
    const next: Lang = lang === 'fr' ? 'en' : 'fr';
    setLang(next);
    setStoredLang(next);
  }

  useEffect(() => {
    api.get<any[]>('/problem-types').then(setProblemTypes).catch(() => {});
  }, []);

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

  function handleViewportChange(c: { lat: number; lng: number }, radius: number) {
    setQueryCenter(c);
    loadNearby(c.lat, c.lng, radius);
    loadOfficialLayer(c.lat, c.lng, radius);
  }

  function locateAndLoad() {
    const apply = (lat: number, lng: number, isReal: boolean) => {
      setQueryCenter({ lat, lng });
      setMapCamera({ lat, lng });
      if (isReal) setUserLocation({ lat, lng });
      loadNearby(lat, lng);
      loadOfficialLayer(lat, lng);
    };
    if (!navigator.geolocation) {
      apply(45.4042, -71.8929, false);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => { setLocating(false); apply(pos.coords.latitude, pos.coords.longitude, true); },
      () => { setLocating(false); apply(45.4042, -71.8929, false); },
    );
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!searchText.trim()) return;
    const city = await searchCity(searchText);
    if (city) {
      setMapCamera({ lat: city.lat, lng: city.lng });
      loadNearby(city.lat, city.lng);
      loadOfficialLayer(city.lat, city.lng);
    }
  }

  useEffect(() => {
    locateAndLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openReport(r: Report) {
    setSelection({ type: 'report', id: r.id });
    setMapCamera({ lat: r.latitude, lng: r.longitude });
  }

  function openExternal(inc: ExternalIncident) {
    setSelection({ type: 'external', id: inc.id });
    setMapCamera({ lat: inc.latitude, lng: inc.longitude });
  }

  function toggleTypeFilter(id: string) {
    setFilterTypeIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const activeFilterCount = filterTypeIds.size + (filterStatus !== 'all' ? 1 : 0);

  const searchLower = searchText.trim().toLowerCase();
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (filterTypeIds.size > 0 && r.problemTypeId && !filterTypeIds.has(r.problemTypeId)) return false;
      if (filterStatus === 'unresolved' && r.status === 'published_resolved') return false;
      if (filterStatus === 'resolved' && r.status !== 'published_resolved') return false;
      if (searchLower && !`${r.problemTypeNameFr} ${r.addressText ?? ''} ${r.description ?? ''}`.toLowerCase().includes(searchLower)) return false;
      return true;
    });
  }, [reports, filterTypeIds, filterStatus, searchLower]);

  const visibleTravauxAll = externalIncidents.filter(
    (inc) => inc.feedKey === 'mtmd_travaux_routiers' && layerPrefs.travaux_routiers,
  );
  const visibleTravaux = searchLower
    ? visibleTravauxAll.filter((inc) => `${inc.title ?? ''}`.toLowerCase().includes(searchLower))
    : visibleTravauxAll;

  const visibleConditions = externalIncidents.filter(
    (inc) => inc.feedKey === 'mtmd_conditions_hivernales' && layerPrefs.conditions_hivernales,
  );

  const reportPins: MapPin[] = filteredReports.map((r) => ({
    id: r.id,
    latitude: r.latitude,
    longitude: r.longitude,
    icon: r.problemTypeIcon ?? '📍',
    colorVar: r.status === 'published_resolved' ? 'resolved' : 'unresolved',
    onClick: () => openReport(r),
  }));

  const officialPins: MapPin[] = visibleTravaux.map((inc) => ({
    id: inc.id,
    latitude: inc.latitude,
    longitude: inc.longitude,
    icon: '🚧',
    colorVar: 'official',
    onClick: () => openExternal(inc),
  }));

  const conditionLines: RoadLineFeature[] = visibleConditions
    .filter((inc) => inc.raw_geometry)
    .map((inc) => ({
      id: inc.id,
      geometry: inc.raw_geometry,
      color: inc.roadConditionColorCode ? `#${inc.roadConditionColorCode}` : '#3B9CFF',
      onClick: () => openExternal(inc),
    }));

  const conditionsLegend = Array.from(
    new Map(
      visibleConditions
        .filter((c) => c.roadConditionColorCode)
        .map((c) => [c.roadConditionColorCode, c.roadConditionLabel ?? c.roadConditionColorCode]),
    ).entries(),
  );

  return (
    <div className="app-full">
      {showAdmin && <AdminPage onClose={() => setShowAdmin(false)} />}
      {!showAdmin && <>
      <div className="map-background">
        <MapView
          center={mapCamera}
          pins={[...reportPins, ...officialPins]}
          lines={conditionLines}
          userLocation={userLocation}
          fullBleed
          theme={theme}
          onViewportChange={handleViewportChange}
        />
      </div>

      <header className="topbar-float">
        <div className="brand-row">
          <span className="brand-mark">511</span>
          <span className="brand-name">{lang === 'fr' ? 'mon511.ca' : 'my511.ca'}</span>
        </div>
        <div className="topbar-actions">
          {authenticated ? (
            <>
              {isModerator && (
                <button className="icon-btn" title={t('administration', lang)} onClick={() => setShowAdmin(true)}>🛡️</button>
              )}
              <button className="icon-btn" title={t('monProfil', lang)} onClick={() => setShowProfileModal(true)}>👤</button>
            </>
          ) : (
            <>
              <button className="btn-ghost" onClick={() => onRequireAuth('login')}>{t('connexion', lang)}</button>
              <button className="btn-primary" style={{ width: 'auto', padding: '9px 16px' }} onClick={() => onRequireAuth('register')}>
                {t('sinscrire', lang)}
              </button>
            </>
          )}
          <button className="icon-btn" title="FR / EN" onClick={toggleLang} style={{ fontFamily: 'var(--font-mono)', fontSize: 10 }}>
            {lang === 'fr' ? 'EN' : 'FR'}
          </button>
          <button
            className="icon-btn"
            title={lang === 'fr' ? 'Alertes MTQ dans la zone visible' : 'MTQ alerts in the visible area'}
            onClick={() => {
              const anyOff = !layerPrefs.travaux_routiers || !layerPrefs.conditions_hivernales;
              const next = { travaux_routiers: anyOff, conditions_hivernales: anyOff };
              setLayerPrefs(next);
              if (authenticated) api.patch('/users/me/map-layers', next).catch(() => {});
              else setLocalLayerPrefs(next);
            }}
          >
            🔔
            {externalIncidents.length > 0 && (
              <span className="badge-dot">{externalIncidents.length}</span>
            )}
          </button>
          <button className="icon-btn" title={t('changerTheme', lang)} onClick={onToggleTheme}>
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>
        </div>
      </header>

      <aside className={`filters-panel-float ${selection ? 'mobile-hidden' : ''}`}>
        <h2>{t('surLaCarte', lang)}</h2>

        <form className="search-bar" onSubmit={handleSearch}>
          <span>🔍</span>
          <input
            placeholder={t('rechercher', lang)}
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
        </form>

        <div className="panel-icon-row">
          <button
            className={`panel-icon-btn ${panelView === 'list' ? 'active' : ''}`}
            title={t('surLaCarte', lang)}
            onClick={() => setPanelView('list')}
          >
            📋
          </button>
          <button
            className={`panel-icon-btn ${panelView === 'filters' ? 'active' : ''}`}
            title={t('filtres', lang)}
            onClick={() => setPanelView('filters')}
          >
            🎚️
            {activeFilterCount > 0 && <span className="badge-dot">{activeFilterCount}</span>}
          </button>
          <button
            className={`panel-icon-btn ${panelView === 'legend' ? 'active' : ''}`}
            title={t('legende', lang)}
            onClick={() => setPanelView('legend')}
          >
            🗺️
          </button>
        </div>

        <div className="layer-toggle" style={{ marginBottom: 8 }}>
          <span style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>🚧 {t('travauxRoutiers', lang)}</span>
          <ToggleSwitch on={layerPrefs.travaux_routiers} onToggle={() => toggleLayer('travaux_routiers')} />
        </div>
        <div className="layer-toggle" style={{ marginBottom: 14 }}>
          <span style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>❄️ {t('conditionsRoutieres', lang)}</span>
          <ToggleSwitch on={layerPrefs.conditions_hivernales} onToggle={() => toggleLayer('conditions_hivernales')} />
        </div>

        {error && <div className="error-banner">{error}</div>}

        {panelView === 'legend' && (
          <div className="report-list-scroll">
            <div className="legend-section">
              <div className="legend-section-title">{lang === 'fr' ? 'Signalements communautaires' : 'Community reports'}</div>
              {problemTypes.map((pt) => (
                <div key={pt.id} className="legend-row">
                  <div className="legend-icon-box">{pt.icon ?? '📍'}</div>
                  <span>{pt.name_fr}</span>
                </div>
              ))}
            </div>
            <div className="legend-section">
              <div className="legend-section-title">{t('travauxRoutiers', lang)}</div>
              <div className="legend-row"><div className="legend-icon-box">🚧</div><span>{lang === 'fr' ? 'Travaux en cours ou prévus' : 'Ongoing or planned roadworks'}</span></div>
            </div>
            {layerPrefs.conditions_hivernales && (
              <div className="legend-section">
                <div className="legend-section-title">{t('conditionsRoutieres', lang)}</div>
                {conditionsLegend.length === 0 && (
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                    {lang === 'fr' ? 'Aucune donnée visible dans la zone actuelle.' : 'No data visible in the current view.'}
                  </div>
                )}
                {conditionsLegend.map(([code, label]) => (
                  <div key={code} className="legend-row">
                    <div className="legend-swatch" style={{ background: `#${code}` }} />
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {panelView === 'filters' && (
          <div className="report-list-scroll">
            <div className="legend-section">
              <div className="legend-section-title">{t('statut', lang)}</div>
              <div className="filter-chip-row">
                <div className={`filter-chip ${filterStatus === 'all' ? 'active' : ''}`} onClick={() => setFilterStatus('all')}>{t('tous', lang)}</div>
                <div className={`filter-chip ${filterStatus === 'unresolved' ? 'active' : ''}`} onClick={() => setFilterStatus('unresolved')}>{t('nonResolu', lang)}</div>
                <div className={`filter-chip ${filterStatus === 'resolved' ? 'active' : ''}`} onClick={() => setFilterStatus('resolved')}>{t('resolu', lang)}</div>
              </div>
            </div>
            <div className="legend-section">
              <div className="legend-section-title">{t('type', lang)}</div>
              <div className="filter-chip-row">
                {problemTypes.map((pt) => (
                  <div
                    key={pt.id}
                    className={`filter-chip ${filterTypeIds.has(pt.id) ? 'active' : ''}`}
                    onClick={() => toggleTypeFilter(pt.id)}
                  >
                    {pt.icon} {pt.name_fr}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {panelView === 'list' && (
          <div className="report-list-scroll">
            {loading && <div className="center-msg">{t('chargement', lang)}</div>}
            {!loading && filteredReports.length === 0 && visibleTravaux.length === 0 && !error && (
              <div className="center-msg">{t('aucunSignalement', lang)}<br />{t('soisLePremier', lang)}</div>
            )}

            {visibleTravaux.map((inc) => {
              const status = travauxStatus(inc.debut, inc.fin, lang);
              return (
                <div key={inc.id} className="report-card" onClick={() => openExternal(inc)}>
                  <div className="rc-icon-hex official">🚧</div>
                  <div className="rc-body">
                    <div className="rc-title">{inc.title ?? inc.sourceName}</div>
                    <div className="rc-meta">{formatMtmdDate(inc.debut, lang)} → {formatMtmdDate(inc.fin, lang)}</div>
                  </div>
                  <span className="pill" style={{ background: 'rgba(255,255,255,0.08)', color: status.color }}>
                    {status.label}
                  </span>
                </div>
              );
            })}

            {filteredReports.map((r) => (
              <div key={r.id} className="report-card" onClick={() => openReport(r)}>
                <div className={`rc-icon-hex ${r.status === 'published_resolved' ? 'resolved' : ''}`}>
                  {r.problemTypeIcon ?? '📍'}
                </div>
                <div className="rc-body">
                  <div className="rc-title">{r.problemTypeNameFr}</div>
                  <div className="rc-meta">{r.addressText ?? 'GPS'}</div>
                </div>
                <span className={`pill ${r.status === 'published_resolved' ? 'resolved' : 'unresolved'}`}>
                  {r.status === 'published_resolved' ? t('resolu', lang) : t('nonResolu', lang)}
                </span>
              </div>
            ))}
          </div>
        )}
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

      <button className="locate-btn-float" onClick={locateAndLoad} disabled={locating} title={t('localiser', lang)}>
        {locating ? '⏳' : '🎯'}
      </button>

      <button className="fab" onClick={() => (authenticated ? setShowCreateModal(true) : onRequireAuth())}>
        <span style={{ fontSize: 18 }}>➕</span>
        <span>{t('signaler', lang)}</span>
      </button>

      <div className="stats-badge-float">
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-resolved)' }} />
        <strong>{filteredReports.length}</strong>
        <span>{lang === 'fr' ? 'signalements visibles' : 'visible reports'}</span>
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
      </>}
    </div>
  );
}
