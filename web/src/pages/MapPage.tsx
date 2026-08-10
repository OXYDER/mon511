import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getUserRole, getLocalLayerPrefs, setLocalLayerPrefs, LayerPrefs } from '../api';
import { t, Lang, getStoredLang, setStoredLang, pickName } from '../i18n';
import LoadingScreen from '../components/LoadingScreen';
import { searchCities, reverseGeocode, GeocodingResult, getSearchHistory, addToSearchHistory, removeFromSearchHistory, clearSearchHistory } from '../geocoding';
import MapView, { MapPin, RoadLineFeature, MapType } from '../components/MapView';
import CreateReportModal from '../components/CreateReportModal';
import DetailPanel from '../components/DetailPanel';
import ExternalIncidentPanel from '../components/ExternalIncidentPanel';
import ProfileModal from '../components/ProfileModal';
import ToggleSwitch from '../components/ToggleSwitch';
import AboutModal from '../components/AboutModal';
import NotificationsPanel from '../components/NotificationsPanel';
import MyReportsPage from './MyReportsPage';
import AdminPage from './AdminPage';

interface Report {
  id: string;
  status: string;
  description: string | null;
  addressText: string | null;
  problemTypeId?: string;
  problemTypeNameFr: string;
  problemTypeNameEn?: string;
  problemTypeIcon: string | null;
  latitude: number;
  longitude: number;
  thumbnailUrl?: string | null;
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
  municipalite: string | null;
  enVigueurDepuis: string | null;
  duree: string | null;
  djma: string | null;
  routeDebut: string | null;
  routeFin: string | null;
  superficieHa: string | null;
  feuCondition: string | null;
  feuMunicipalite: string | null;
  sucreMunicipalite: string | null;
  sucreAdresse: string | null;
  sucreSiteWeb: string | null;
}

const FEU_CONDITION_LABELS: Record<string, string> = {
  '0': 'Recensé', '1': 'Nouveau', '2': 'Sous observation',
  '3': 'Hors contrôle', '4': 'Contenu', '5': 'Maîtrisé', '6': 'Éteint',
};

/** Échelle de couleur maison (pas de code officiel fourni par le MTQ pour
 * le débit de circulation, contrairement aux conditions hivernales) —
 * verte (faible) à rouge (élevé), sur une échelle de 0 à 60 000 véh/jour. */
function trafficColor(djma: string | null): string {
  const value = djma ? parseFloat(djma) : 0;
  if (!value) return '#6B7280';
  if (value < 5000) return '#2FBF71';
  if (value < 15000) return '#F5B301';
  if (value < 35000) return '#FF8A3B';
  return '#FF4D5E';
}

interface ProblemType {
  id: string;
  name_fr: string;
  name_en?: string;
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
  const [circulationIncidents, setCirculationIncidents] = useState<ExternalIncident[]>([]);
  const [allCabanes, setAllCabanes] = useState<ExternalIncident[]>([]);
  const [problemTypes, setProblemTypes] = useState<ProblemType[]>([]);
  const [layerPrefs, setLayerPrefs] = useState<LayerPrefs>({
    travaux_routiers: false,
    conditions_hivernales: false,
    avertissements: false,
    debit_circulation: false,
    feux_foret: false,
    cabanes_a_sucre: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Le gros chargement animé n'est montré qu'au tout premier chargement de
  // la carte (démarrage de l'app) — pas à chaque déplacement/recherche qui
  // remet aussi `loading` à true.
  const hasLoadedOnceRef = useRef(false);
  useEffect(() => {
    if (!loading) hasLoadedOnceRef.current = true;
  }, [loading]);
  const showInitialLoader = loading && !hasLoadedOnceRef.current;
  const [locating, setLocating] = useState(false);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  const [queryCenter, setQueryCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [mapCamera, setMapCamera] = useState<{ lat: number; lng: number; zoom?: number } | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ lat: number; lng: number; x: number; y: number } | null>(null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [createModalCoords, setCreateModalCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [showFiltersLegend, setShowFiltersLegend] = useState(false);
  const [mapType, setMapType] = useState<MapType>('default');
  const [showMapDetailsMenu, setShowMapDetailsMenu] = useState(false);
  const [showMapTypeMenu, setShowMapTypeMenu] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // Ferme automatiquement les panneaux flottants (filtres/légende, détails
  // de la carte, type de carte) dès qu'on clique ailleurs — pas seulement
  // en cliquant sur un autre de ces boutons.
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (target.closest('.map-menu-btn, .map-menu-panel')) return;
      setShowFiltersLegend(false);
      setShowMapDetailsMenu(false);
      setShowMapTypeMenu(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [showAbout, setShowAbout] = useState(false);
  const [showMyReports, setShowMyReports] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    reports: true, cabanes: true, feux: true, avertissements: true, travaux: true,
  });
  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }
  const [panelCollapsed, setPanelCollapsed] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [currentAreaName, setCurrentAreaName] = useState('');
  const [citySuggestions, setCitySuggestions] = useState<GeocodingResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
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
    setSearchHistory(getSearchHistory());
  }, []);

  useEffect(() => {
    if (!authenticated) { setUnreadCount(0); return; }
    api.get<number>('/notifications/unread-count').then(setUnreadCount).catch(() => {});
  }, [authenticated, showNotifications]);

  useEffect(() => {
    if (authenticated) {
      api.get<any>('/users/me').then((me) => {
        if (me.map_layer_preferences) setLayerPrefs(me.map_layer_preferences);
        setCurrentUserId(me.id);
      });
    } else {
      setLayerPrefs(getLocalLayerPrefs());
      setCurrentUserId(null);
    }
  }, [authenticated]);

  // À la connexion ou déconnexion, la liste déjà en mémoire peut contenir
  // des signalements qui ne devraient plus être visibles (ex. mon propre
  // signalement en attente d'approbation, retiré côté serveur dès qu'on se
  // déconnecte) — sans ça, ils restaient affichés jusqu'au prochain
  // déplacement de la carte. On force un rafraîchissement immédiat.
  useEffect(() => {
    if (queryCenter) loadNearby(queryCenter.lat, queryCenter.lng);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      const results = await api.get<Report[]>(`/reports/nearby?lat=${lat}&lng=${lng}&radius=${Math.min(radius, 400000)}`);
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
        `/external-data/incidents/nearby?lat=${lat}&lng=${lng}&radius=${Math.min(Math.max(radius, 50000), 1500000)}`,
      );
      setExternalIncidents(results);
    } catch {
      setExternalIncidents([]);
    }
    // Le débit de circulation est de loin le type le plus volumineux
    // (près de 8000 segments à travers le Québec) — une requête séparée,
    // filtrée par type, l'empêche d'écraser les autres types (conditions,
    // travaux, avertissements, feux) dans une même limite partagée.
    try {
      const circulation = await api.get<ExternalIncident[]>(
        `/external-data/incidents/nearby?lat=${lat}&lng=${lng}&radius=${Math.min(Math.max(radius, 50000), 1500000)}&feedKey=mtmd_debit_circulation`,
      );
      setCirculationIncidents(circulation);
    } catch {
      setCirculationIncidents([]);
    }
  }

  /** Les cabanes à sucre sont peu nombreuses (une centaine) et réparties
   * dans tout le Québec — chargées une seule fois avec un très grand rayon
   * fixe, indépendamment de la zone visible, pour qu'elles restent toujours
   * affichées peu importe le niveau de zoom. */
  async function loadAllCabanes() {
    try {
      const results = await api.get<ExternalIncident[]>(
        `/external-data/incidents/nearby?lat=52&lng=-71.5&radius=1500000&feedKey=sit_agrotourisme`,
      );
      setAllCabanes(results);
    } catch {
      setAllCabanes([]);
    }
  }

  type Bounds = { north: number; south: number; east: number; west: number };
  const [viewBounds, setViewBounds] = useState<Bounds | null>(null);

  function handleViewportChange(c: { lat: number; lng: number }, radius: number, zoom: number, bounds: Bounds) {
    setQueryCenter(c);
    setViewBounds(bounds);
    setContextMenu(null);
    loadNearby(c.lat, c.lng, radius);
    loadOfficialLayer(c.lat, c.lng, radius);
    reverseGeocode(c.lat, c.lng, zoom).then((name) => { if (name) setCurrentAreaName(name); });
  }

  function withinBounds(lat: number, lng: number): boolean {
    if (!viewBounds) return true;
    return lat <= viewBounds.north && lat >= viewBounds.south && lng <= viewBounds.east && lng >= viewBounds.west;
  }

  function locateAndLoad() {
    const apply = (lat: number, lng: number, isReal: boolean) => {
      setQueryCenter({ lat, lng });
      setMapCamera({ lat, lng });
      if (isReal) setUserLocation({ lat, lng });
      loadNearby(lat, lng);
      loadOfficialLayer(lat, lng);
      reverseGeocode(lat, lng).then((name) => { if (name) setCurrentAreaName(name); });
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
    setShowDropdown(false);
    const results = await searchCities(searchText, 1);
    if (results[0]) {
      // Une ville a été trouvée : on y va, et on efface la recherche pour
      // qu'elle n'agisse pas aussi comme filtre de texte sur les pins/liste
      // (sinon rien ne correspond au nom de la ville et tout disparaît).
      addToSearchHistory(searchText.trim());
      setSearchHistory(getSearchHistory());
      setSearchText('');
      setAppliedSearch('');
      setMapCamera({ lat: results[0].lat, lng: results[0].lng });
      loadNearby(results[0].lat, results[0].lng);
      loadOfficialLayer(results[0].lat, results[0].lng);
    } else {
      // Pas de ville correspondante : on retombe sur un simple filtre de texte.
      setAppliedSearch(searchText);
    }
  }

  function selectCitySuggestion(city: GeocodingResult) {
    addToSearchHistory(city.name);
    setSearchHistory(getSearchHistory());
    setSearchText(city.name);
    setAppliedSearch('');
    setShowDropdown(false);
    setMapCamera({ lat: city.lat, lng: city.lng });
    loadNearby(city.lat, city.lng);
    loadOfficialLayer(city.lat, city.lng);
  }

  function selectHistoryEntry(query: string) {
    setSearchText(query);
    setShowDropdown(true);
    searchCities(query, 1).then((results) => {
      if (results[0]) {
        addToSearchHistory(query);
        setSearchHistory(getSearchHistory());
        setSearchText('');
        setShowDropdown(false);
        setMapCamera({ lat: results[0].lat, lng: results[0].lng });
        loadNearby(results[0].lat, results[0].lng);
        loadOfficialLayer(results[0].lat, results[0].lng);
      }
    });
  }

  function selectReportSuggestion(r: Report) {
    setSearchText('');
    setAppliedSearch('');
    setShowDropdown(false);
    openReport(r);
  }

  // Suggestions de villes (débattues) pendant la frappe — n'affecte PAS la
  // liste/carte tant que rien n'est choisi ou validé.
  useEffect(() => {
    if (!searchText.trim()) { setCitySuggestions([]); return; }
    const timeout = setTimeout(() => {
      searchCities(searchText, 4).then(setCitySuggestions);
    }, 350);
    return () => clearTimeout(timeout);
  }, [searchText]);

  useEffect(() => {
    locateAndLoad();
    loadAllCabanes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function openReport(r: Report) {
    setSelection({ type: 'report', id: r.id });
    setMapCamera({ lat: r.latitude, lng: r.longitude, zoom: 17 });
  }

  /** Ouvre un signalement dont on n'a que l'id (ex. depuis une notification)
   * — va chercher ses coordonnées pour centrer la carte dessus. */
  async function openReportById(id: string) {
    setSelection({ type: 'report', id });
    try {
      const r = await api.get<any>(`/reports/${id}`);
      if (r.latitude && r.longitude) setMapCamera({ lat: r.latitude, lng: r.longitude, zoom: 17 });
    } catch {
      // Le panneau de détail affichera son propre message d'erreur si le
      // signalement est introuvable — pas besoin de dupliquer ici.
    }
  }

  function openExternal(inc: ExternalIncident) {
    setSelection({ type: 'external', id: inc.id });
    setMapCamera({ lat: inc.latitude, lng: inc.longitude, zoom: 17 });
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

  const searchLower = appliedSearch.trim().toLowerCase();
  const liveSearchLower = searchText.trim().toLowerCase();
  const reportSuggestions = liveSearchLower
    ? reports.filter((r) => `${r.problemTypeNameFr} ${r.problemTypeNameEn ?? ''} ${r.addressText ?? ''}`.toLowerCase().includes(liveSearchLower)).slice(0, 5)
    : [];
  const filteredReports = useMemo(() => {
    return reports.filter((r) => {
      if (!withinBounds(r.latitude, r.longitude)) return false;
      if (filterTypeIds.size > 0 && r.problemTypeId && !filterTypeIds.has(r.problemTypeId)) return false;
      if (filterStatus === 'unresolved' && r.status === 'published_resolved') return false;
      if (filterStatus === 'resolved' && r.status !== 'published_resolved') return false;
      if (searchLower && !`${r.problemTypeNameFr} ${r.problemTypeNameEn ?? ''} ${r.addressText ?? ''} ${r.description ?? ''}`.toLowerCase().includes(searchLower)) return false;
      return true;
    });
  }, [reports, filterTypeIds, filterStatus, searchLower, viewBounds]);

  const visibleTravauxAll = externalIncidents.filter(
    (inc) => inc.feedKey === 'mtmd_travaux_routiers' && layerPrefs.travaux_routiers && withinBounds(inc.latitude, inc.longitude),
  );
  const visibleTravaux = searchLower
    ? visibleTravauxAll.filter((inc) => `${inc.title ?? ''}`.toLowerCase().includes(searchLower))
    : visibleTravauxAll;

  const visibleConditions = externalIncidents.filter(
    (inc) => inc.feedKey === 'mtmd_conditions_hivernales' && layerPrefs.conditions_hivernales,
  );

  const visibleAvertissementsAll = externalIncidents.filter(
    (inc) => inc.feedKey === 'mtmd_avertissements' && layerPrefs.avertissements && withinBounds(inc.latitude, inc.longitude),
  );
  const visibleAvertissements = searchLower
    ? visibleAvertissementsAll.filter((inc) => `${inc.title ?? ''} ${inc.municipalite ?? ''}`.toLowerCase().includes(searchLower))
    : visibleAvertissementsAll;

  const visibleCirculation = circulationIncidents.filter(
    (inc) => layerPrefs.debit_circulation,
  );

  const visibleFeux = externalIncidents.filter(
    (inc) => inc.feedKey === 'sopfeu_feux_actifs' && layerPrefs.feux_foret && withinBounds(inc.latitude, inc.longitude),
  );

  const visibleCabanes = allCabanes.filter((inc) => layerPrefs.cabanes_a_sucre && withinBounds(inc.latitude, inc.longitude));

  const reportPins: MapPin[] = filteredReports.map((r) => ({
    id: r.id,
    latitude: r.latitude,
    longitude: r.longitude,
    icon: r.problemTypeIcon ?? '📍',
    colorVar: r.status === 'published_resolved' ? 'resolved' : 'unresolved',
    onClick: () => openReport(r),
    photoUrl: r.thumbnailUrl,
    selected: selection?.type === 'report' && selection.id === r.id,
    pending: r.status === 'pending_moderation',
  }));

  const officialPins: MapPin[] = [
    ...visibleTravaux.map((inc) => ({
      id: inc.id, latitude: inc.latitude, longitude: inc.longitude,
      icon: '🚧', colorVar: 'official' as const, onClick: () => openExternal(inc),
      selected: selection?.type === 'external' && selection.id === inc.id,
    })),
    ...visibleAvertissements.map((inc) => ({
      id: inc.id, latitude: inc.latitude, longitude: inc.longitude,
      icon: '⚠️', colorVar: 'official' as const, onClick: () => openExternal(inc),
      selected: selection?.type === 'external' && selection.id === inc.id,
    })),
    ...visibleFeux.map((inc) => ({
      id: inc.id, latitude: inc.latitude, longitude: inc.longitude,
      icon: '🔥', colorVar: 'official' as const, onClick: () => openExternal(inc),
      selected: selection?.type === 'external' && selection.id === inc.id,
    })),
    ...visibleCabanes.map((inc) => ({
      id: inc.id, latitude: inc.latitude, longitude: inc.longitude,
      icon: '🍁', colorVar: 'official' as const, onClick: () => openExternal(inc),
      selected: selection?.type === 'external' && selection.id === inc.id,
    })),
  ];

  const circulationLines: RoadLineFeature[] = visibleCirculation
    .filter((inc) => inc.raw_geometry)
    .map((inc) => ({
      id: inc.id,
      geometry: inc.raw_geometry,
      color: trafficColor(inc.djma),
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
      <LoadingScreen visible={showInitialLoader} />
      {showAdmin && <AdminPage onClose={() => setShowAdmin(false)} />}
      {showMyReports && !showAdmin && <MyReportsPage onClose={() => setShowMyReports(false)} lang={lang} />}
      {!showAdmin && !showMyReports && <>
      <div className="map-background">
        <MapView
          center={mapCamera}
          pins={[...reportPins, ...officialPins]}
          lines={[...conditionLines, ...circulationLines]}
          userLocation={userLocation}
          fullBleed
          theme={theme}
          onViewportChange={handleViewportChange}
          mapType={mapType}
          onMapClick={(lat, lng, x, y) => setContextMenu({ lat, lng, x, y })}
          focusPinId={selection?.id ?? null}
          hoveredPinId={hoveredPinId}
        />
      </div>

      <header className="topbar-float">
        <div className="brand-row">
          <img src="/brand/header.png" alt="mon511.ca" style={{ height: 54, width: 'auto' }} />
        </div>
        <div className="topbar-actions">
          {authenticated ? (
            <>
              {isModerator && (
                <button className="icon-btn" title={t('administration', lang)} onClick={() => setShowAdmin(true)}>🛡️</button>
              )}
              <button className="icon-btn" title={lang === 'fr' ? 'Mes signalements' : 'My reports'} onClick={() => setShowMyReports(true)}>📋</button>
              <button className="icon-btn" title={lang === 'fr' ? 'Notifications' : 'Notifications'} onClick={() => setShowNotifications(true)}>
                🔔
                {unreadCount > 0 && <span className="badge-dot">{unreadCount}</span>}
              </button>
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
          <button className="icon-btn" title={t('changerTheme', lang)} onClick={onToggleTheme}>
            {theme === 'dark' ? '🌙' : '☀️'}
          </button>
          <button className="icon-btn" title={lang === 'fr' ? 'À propos' : 'About'} onClick={() => setShowAbout(true)}>
            ℹ️
          </button>
        </div>
      </header>

      <aside className={`filters-panel-float ${selection ? 'mobile-hidden' : ''} ${panelCollapsed ? 'collapsed' : ''}`}>
        <h2 onClick={() => setPanelCollapsed((v) => !v)}>
          <span>{t('surLaCarte', lang)}</span>
          <button className="panel-collapse-btn" onClick={(e) => { e.stopPropagation(); setPanelCollapsed((v) => !v); }}>
            {panelCollapsed ? '▸' : '▾'}
          </button>
        </h2>

        <form className="search-bar" onSubmit={handleSearch}>
          <span>🔍</span>
          <input
            placeholder={currentAreaName || t('rechercher', lang)}
            value={searchText}
            onChange={(e) => {
              setSearchText(e.target.value);
              setShowDropdown(true);
              if (e.target.value.trim() === '') setAppliedSearch('');
            }}
            onFocus={() => setShowDropdown(true)}
            onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
          />
          {searchText && (
            <span
              onClick={() => { setSearchText(''); setAppliedSearch(''); setShowDropdown(false); }}
              style={{ cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              ✕
            </span>
          )}
        </form>

        {showDropdown && !searchText.trim() && searchHistory.length > 0 && (
          <div className="search-dropdown">
            <div className="search-dropdown-section-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{lang === 'fr' ? 'Recherches récentes' : 'Recent searches'}</span>
              <span
                style={{ cursor: 'pointer', textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}
                onClick={() => { clearSearchHistory(); setSearchHistory([]); }}
              >
                {lang === 'fr' ? 'Effacer' : 'Clear'}
              </span>
            </div>
            {searchHistory.map((q) => (
              <div key={q} className="search-dropdown-item" onClick={() => selectHistoryEntry(q)} style={{ justifyContent: 'space-between' }}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}><span>🕓</span><span>{q}</span></span>
                <span
                  onClick={(e) => { e.stopPropagation(); removeFromSearchHistory(q); setSearchHistory(getSearchHistory()); }}
                  style={{ color: 'var(--text-muted)', padding: '0 4px' }}
                >
                  ✕
                </span>
              </div>
            ))}
          </div>
        )}

        {showDropdown && searchText.trim() && (citySuggestions.length > 0 || reportSuggestions.length > 0) && (
          <div className="search-dropdown">
            {citySuggestions.length > 0 && (
              <>
                <div className="search-dropdown-section-title">{lang === 'fr' ? 'Villes' : 'Cities'}</div>
                {citySuggestions.map((c) => (
                  <div key={c.name} className="search-dropdown-item" onClick={() => selectCitySuggestion(c)}>
                    <span>📍</span><span>{c.name}</span>
                  </div>
                ))}
              </>
            )}
            {reportSuggestions.length > 0 && (
              <>
                <div className="search-dropdown-section-title">{lang === 'fr' ? 'Signalements' : 'Reports'}</div>
                {reportSuggestions.map((r) => (
                  <div key={r.id} className="search-dropdown-item" onClick={() => selectReportSuggestion(r)}>
                    <span>{r.problemTypeIcon ?? '📍'}</span><span>{pickName(r.problemTypeNameFr, r.problemTypeNameEn, lang)} — {r.addressText ?? 'GPS'}</span>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {error && <div className="error-banner">{error}</div>}

        <div className="report-list-scroll">
          {loading && <div className="center-msg">{t('chargement', lang)}</div>}
            {!loading && filteredReports.length === 0 && visibleTravaux.length === 0 && visibleAvertissements.length === 0 && visibleFeux.length === 0 && visibleCabanes.length === 0 && !error && (
              <div className="center-msg">{t('aucunSignalement', lang)}<br />{t('soisLePremier', lang)}</div>
            )}

            {/* Signalements communautaires — priorité au but premier de l'app */}
            {filteredReports.length > 0 && (
              <div className="list-section">
                <button className="list-section-header" onClick={() => toggleSection('reports')}>
                  <span>{openSections.reports ? '▾' : '▸'} {lang === 'fr' ? 'Signalements' : 'Reports'}</span>
                  <span className="list-section-count">{filteredReports.length}</span>
                </button>
                {openSections.reports && filteredReports.map((r) => (
                  <div
                    key={r.id}
                    className="report-card"
                    style={{ borderColor: selection?.type === 'report' && selection.id === r.id ? 'var(--accent-signal)' : undefined }}
                    onClick={() => openReport(r)}
                    onMouseEnter={() => setHoveredPinId(r.id)}
                    onMouseLeave={() => setHoveredPinId(null)}
                  >
                    <div className={`rc-icon-hex ${r.status === 'published_resolved' ? 'resolved' : ''}`}>
                      {r.problemTypeIcon ?? '📍'}
                    </div>
                    <div className="rc-body">
                      <div className="rc-title">{pickName(r.problemTypeNameFr, r.problemTypeNameEn, lang)}</div>
                      <div className="rc-meta">{r.addressText ?? 'GPS'}</div>
                    </div>
                    <span className={`pill ${r.status === 'published_resolved' ? 'resolved' : r.status === 'pending_moderation' ? 'official' : 'unresolved'}`}>
                      {r.status === 'published_resolved' ? t('resolu', lang) : r.status === 'pending_moderation' ? (lang === 'fr' ? '⏳ En attente' : '⏳ Pending') : t('nonResolu', lang)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {visibleCabanes.length > 0 && (
              <div className="list-section">
                <button className="list-section-header" onClick={() => toggleSection('cabanes')}>
                  <span>{openSections.cabanes ? '▾' : '▸'} 🍁 {lang === 'fr' ? 'Cabanes à sucre' : 'Sugar shacks'}</span>
                  <span className="list-section-count">{visibleCabanes.length}</span>
                </button>
                {openSections.cabanes && visibleCabanes.map((inc) => (
                  <div
                    key={inc.id}
                    className="report-card"
                    style={{ borderColor: selection?.type === 'external' && selection.id === inc.id ? 'var(--accent-signal)' : undefined }}
                    onClick={() => openExternal(inc)}
                  >
                    <div className="rc-icon-hex official">🍁</div>
                    <div className="rc-body">
                      <div className="rc-title">{inc.title ?? inc.sourceName}</div>
                      <div className="rc-meta">{inc.sucreMunicipalite ?? 'Cabane à sucre'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {visibleFeux.length > 0 && (
              <div className="list-section">
                <button className="list-section-header" onClick={() => toggleSection('feux')}>
                  <span>{openSections.feux ? '▾' : '▸'} 🔥 {lang === 'fr' ? 'Feux de forêt' : 'Forest fires'}</span>
                  <span className="list-section-count">{visibleFeux.length}</span>
                </button>
                {openSections.feux && visibleFeux.map((inc) => (
                  <div
                    key={inc.id}
                    className="report-card"
                    style={{ borderColor: selection?.type === 'external' && selection.id === inc.id ? 'var(--accent-signal)' : undefined }}
                    onClick={() => openExternal(inc)}
                  >
                    <div className="rc-icon-hex official">🔥</div>
                    <div className="rc-body">
                      <div className="rc-title">{inc.feuMunicipalite ?? inc.title ?? inc.sourceName}</div>
                      <div className="rc-meta">{inc.superficieHa ? `${inc.superficieHa} ha` : 'SOPFEU'}</div>
                    </div>
                    <span className="pill" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--status-danger)' }}>
                      {FEU_CONDITION_LABELS[inc.feuCondition ?? ''] ?? (lang === 'fr' ? 'Actif' : 'Active')}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {visibleAvertissements.length > 0 && (
              <div className="list-section">
                <button className="list-section-header" onClick={() => toggleSection('avertissements')}>
                  <span>{openSections.avertissements ? '▾' : '▸'} ⚠️ {lang === 'fr' ? 'Avertissements' : 'Advisories'}</span>
                  <span className="list-section-count">{visibleAvertissements.length}</span>
                </button>
                {openSections.avertissements && visibleAvertissements.map((inc) => (
                  <div
                    key={inc.id}
                    className="report-card"
                    style={{ borderColor: selection?.type === 'external' && selection.id === inc.id ? 'var(--accent-signal)' : undefined }}
                    onClick={() => openExternal(inc)}
                  >
                    <div className="rc-icon-hex official">⚠️</div>
                    <div className="rc-body">
                      <div className="rc-title">{inc.municipalite ?? inc.title ?? inc.sourceName}</div>
                      <div className="rc-meta">{inc.title ?? ''}</div>
                    </div>
                    <span className="pill" style={{ background: 'rgba(255,255,255,0.08)', color: 'var(--official-blue)' }}>
                      {lang === 'fr' ? 'Actif' : 'Active'}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {visibleTravaux.length > 0 && (
              <div className="list-section">
                <button className="list-section-header" onClick={() => toggleSection('travaux')}>
                  <span>{openSections.travaux ? '▾' : '▸'} 🚧 {t('travauxRoutiers', lang)}</span>
                  <span className="list-section-count">{visibleTravaux.length}</span>
                </button>
                {openSections.travaux && visibleTravaux.map((inc) => {
                  const status = travauxStatus(inc.debut, inc.fin, lang);
                  return (
                    <div
                    key={inc.id}
                    className="report-card"
                    style={{ borderColor: selection?.type === 'external' && selection.id === inc.id ? 'var(--accent-signal)' : undefined }}
                    onClick={() => openExternal(inc)}
                  >
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
              </div>
            )}
          </div>
      </aside>

      {selection?.type === 'report' && (
        <DetailPanel
          reportId={selection.id}
          onClose={() => setSelection(null)}
          onChanged={() => queryCenter && loadNearby(queryCenter.lat, queryCenter.lng)}
          authenticated={authenticated}
          onRequireAuth={onRequireAuth}
          lang={lang}
          currentUserId={currentUserId}
        />
      )}
      {selection?.type === 'external' && (
        <ExternalIncidentPanel incidentId={selection.id} onClose={() => setSelection(null)} />
      )}

      <button className="locate-btn-float" onClick={locateAndLoad} disabled={locating} title={t('localiser', lang)}>
        {locating ? '⏳' : '🎯'}
      </button>

      <button
        className={`map-menu-btn ${showFiltersLegend ? 'active' : ''}`}
        style={{ bottom: 264 }}
        onClick={() => { setShowFiltersLegend((v) => !v); setShowMapDetailsMenu(false); setShowMapTypeMenu(false); }}
        title={lang === 'fr' ? 'Filtres et légende' : 'Filters and legend'}
      >
        🎚️
        {activeFilterCount > 0 && <span className="badge-dot">{activeFilterCount}</span>}
      </button>
      {showFiltersLegend && (
        <div className="map-menu-panel" style={{ bottom: 264, width: 280, maxHeight: '60vh', overflowY: 'auto' }}>
          <h3>{lang === 'fr' ? 'Filtres et légende' : 'Filters and legend'}</h3>

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
                  {pt.icon} {pickName(pt.name_fr, pt.name_en, lang)}
                </div>
              ))}
            </div>
          </div>

          <div className="legend-section">
            <div className="legend-section-title">{lang === 'fr' ? 'Signalements communautaires' : 'Community reports'}</div>
            {problemTypes.map((pt) => (
              <div key={pt.id} className="legend-row">
                <div className="legend-icon-box">{pt.icon ?? '📍'}</div>
                <span>{pickName(pt.name_fr, pt.name_en, lang)}</span>
              </div>
            ))}
          </div>
          <div className="legend-section">
            <div className="legend-section-title">{t('travauxRoutiers', lang)}</div>
            <div className="legend-row"><div className="legend-icon-box">🚧</div><span>{lang === 'fr' ? 'Travaux en cours ou prévus' : 'Ongoing or planned roadworks'}</span></div>
          </div>
          <div className="legend-section">
            <div className="legend-section-title">{lang === 'fr' ? 'Avertissements' : 'Advisories'}</div>
            <div className="legend-row"><div className="legend-icon-box">⚠️</div><span>{lang === 'fr' ? 'Fermeture, incident, obstacle' : 'Closure, incident, obstacle'}</span></div>
          </div>
          <div className="legend-section">
            <div className="legend-section-title">{lang === 'fr' ? 'Feux de forêt' : 'Forest fires'}</div>
            <div className="legend-row"><div className="legend-icon-box">🔥</div><span>{lang === 'fr' ? 'Incendie de forêt actif (SOPFEU)' : 'Active forest fire (SOPFEU)'}</span></div>
          </div>
          <div className="legend-section">
            <div className="legend-section-title">{lang === 'fr' ? 'Cabanes à sucre' : 'Sugar shacks'}</div>
            <div className="legend-row"><div className="legend-icon-box">🍁</div><span>{lang === 'fr' ? 'Cabane à sucre (SIT Québec)' : 'Sugar shack (SIT Québec)'}</span></div>
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
          {layerPrefs.debit_circulation && (
            <div className="legend-section">
              <div className="legend-section-title">{lang === 'fr' ? 'Débit de circulation (échelle non officielle)' : 'Traffic volume (unofficial scale)'}</div>
              <div className="legend-row"><div className="legend-swatch" style={{ background: '#2FBF71' }} /><span>{lang === 'fr' ? '< 5 000 véh/jour' : '< 5,000 veh/day'}</span></div>
              <div className="legend-row"><div className="legend-swatch" style={{ background: '#F5B301' }} /><span>5 000 – 15 000</span></div>
              <div className="legend-row"><div className="legend-swatch" style={{ background: '#FF8A3B' }} /><span>15 000 – 35 000</span></div>
              <div className="legend-row"><div className="legend-swatch" style={{ background: '#FF4D5E' }} /><span>{lang === 'fr' ? '> 35 000 véh/jour' : '> 35,000 veh/day'}</span></div>
            </div>
          )}
        </div>
      )}

      <button
        className={`map-menu-btn ${showMapDetailsMenu ? 'active' : ''}`}
        style={{ bottom: 208 }}
        onClick={() => { setShowMapDetailsMenu((v) => !v); setShowMapTypeMenu(false); setShowFiltersLegend(false); }}
        title={lang === 'fr' ? 'Détails de la carte' : 'Map details'}
      >
        🗂️
      </button>
      {showMapDetailsMenu && (
        <div className="map-menu-panel" style={{ bottom: 208 }}>
          <h3>{lang === 'fr' ? 'Détails de la carte' : 'Map details'}</h3>
          <div className="layer-toggle" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>🚧 {t('travauxRoutiers', lang)}</span>
            <ToggleSwitch on={layerPrefs.travaux_routiers} onToggle={() => toggleLayer('travaux_routiers')} />
          </div>
          <div className="layer-toggle" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>⚠️ {lang === 'fr' ? 'Avertissements' : 'Advisories'}</span>
            <ToggleSwitch on={layerPrefs.avertissements} onToggle={() => toggleLayer('avertissements')} />
          </div>
          <div className="layer-toggle" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>❄️ {t('conditionsRoutieres', lang)}</span>
            <ToggleSwitch on={layerPrefs.conditions_hivernales} onToggle={() => toggleLayer('conditions_hivernales')} />
          </div>
          <div className="layer-toggle" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>🚗 {lang === 'fr' ? 'Débit de circulation' : 'Traffic volume'}</span>
            <ToggleSwitch on={layerPrefs.debit_circulation} onToggle={() => toggleLayer('debit_circulation')} />
          </div>
          <div className="layer-toggle" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>🔥 {lang === 'fr' ? 'Feux de forêt' : 'Forest fires'}</span>
            <ToggleSwitch on={layerPrefs.feux_foret} onToggle={() => toggleLayer('feux_foret')} />
          </div>
          <div className="layer-toggle" style={{ marginBottom: 0 }}>
            <span style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>🍁 {lang === 'fr' ? 'Cabanes à sucre' : 'Sugar shacks'}</span>
            <ToggleSwitch on={layerPrefs.cabanes_a_sucre} onToggle={() => toggleLayer('cabanes_a_sucre')} />
          </div>
        </div>
      )}

      <button
        className={`map-menu-btn ${showMapTypeMenu ? 'active' : ''}`}
        style={{ bottom: 152 }}
        onClick={() => { setShowMapTypeMenu((v) => !v); setShowMapDetailsMenu(false); setShowFiltersLegend(false); }}
        title={lang === 'fr' ? 'Type de carte' : 'Map type'}
      >
        🗺️
      </button>
      {showMapTypeMenu && (
        <div className="map-menu-panel" style={{ bottom: 152 }}>
          <h3>{lang === 'fr' ? 'Type de carte' : 'Map type'}</h3>
          <div className="map-type-grid">
            <div className={`map-type-option ${mapType === 'default' ? 'active' : ''}`} onClick={() => setMapType('default')}>
              <span className="mt-icon">🗺️</span>
              <span>{lang === 'fr' ? 'Par défaut' : 'Default'}</span>
            </div>
            <div className={`map-type-option ${mapType === 'satellite' ? 'active' : ''}`} onClick={() => setMapType('satellite')}>
              <span className="mt-icon">🛰️</span>
              <span>{lang === 'fr' ? 'Satellite' : 'Satellite'}</span>
            </div>
          </div>
        </div>
      )}

      <button className="fab" onClick={() => (authenticated ? (setCreateModalCoords(null), setShowCreateModal(true)) : onRequireAuth())}>
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
          initialCoords={createModalCoords}
          lang={lang}
          onClose={() => { setShowCreateModal(false); setCreateModalCoords(null); }}
          onCreated={() => {
            setShowCreateModal(false);
            setCreateModalCoords(null);
            if (queryCenter) loadNearby(queryCenter.lat, queryCenter.lng);
          }}
        />
      )}

      {showProfileModal && (
        <ProfileModal
          onClose={() => setShowProfileModal(false)}
          onLogout={() => { setShowProfileModal(false); onLogout(); }}
          onOpenMyReports={() => { setShowProfileModal(false); setShowMyReports(true); }}
        />
      )}
      {contextMenu && (
        <div
          onClick={() => setContextMenu(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 45 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'absolute', left: contextMenu.x, top: contextMenu.y, transform: 'translate(-50%, -110%)',
              background: 'var(--panel-solid)', border: '1px solid var(--panel-border)', borderRadius: 10,
              boxShadow: 'var(--shadow-panel)', padding: 6,
            }}
          >
            <button
              className="btn-ghost"
              style={{ whiteSpace: 'nowrap' }}
              onClick={() => {
                const { lat, lng } = contextMenu;
                setContextMenu(null);
                if (!authenticated) { onRequireAuth(); return; }
                setCreateModalCoords({ lat, lng });
                setShowCreateModal(true);
              }}
            >
              📍 {lang === 'fr' ? 'Signaler ici' : 'Report here'}
            </button>
          </div>
        </div>
      )}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} lang={lang} />}
      {showNotifications && <NotificationsPanel onClose={() => setShowNotifications(false)} lang={lang} onOpenReport={openReportById} onUnreadCountChange={setUnreadCount} />}
      </>}
    </div>
  );
}
