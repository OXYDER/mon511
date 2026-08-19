import { useEffect, useMemo, useRef, useState, Suspense, lazy } from 'react';
import { api, getUserRole, getLocalLayerPrefs, setLocalLayerPrefs, LayerPrefs, DEFAULT_LAYER_PREFS, clearToken } from '../api';
import { getSocket } from '../socket';
import { t, Lang, getStoredLang, setStoredLang, pickName, statusPillClass, timeAgo } from '../i18n';
import LoadingScreen from '../components/LoadingScreen';
import SiteBanner from '../components/SiteBanner';
import MessageToast from '../components/MessageToast';
import { searchCities, reverseGeocode, GeocodingResult, getSearchHistory, addToSearchHistory, removeFromSearchHistory, clearSearchHistory } from '../geocoding';
import MapView, { MapPin, RoadLineFeature, MapType } from '../components/MapView';
import ToggleSwitch from '../components/ToggleSwitch';

// Chargés seulement au moment où on en a vraiment besoin (après une action
// de l'usager) — pas nécessaires au tout premier affichage de la carte,
// donc pas la peine de les inclure dans le paquet initial.
const CreateReportModal = lazy(() => import('../components/CreateReportModal'));
const DetailPanel = lazy(() => import('../components/DetailPanel'));
const ExternalIncidentPanel = lazy(() => import('../components/ExternalIncidentPanel'));
const ProfileModal = lazy(() => import('../components/ProfileModal'));
const AboutModal = lazy(() => import('../components/AboutModal'));
const NotificationsPanel = lazy(() => import('../components/NotificationsPanel'));
const MessagingPanel = lazy(() => import('../components/MessagingPanel'));
const FriendsPanel = lazy(() => import('../components/FriendsPanel'));
const PublicProfileModal = lazy(() => import('../components/PublicProfileModal'));
const FaqModal = lazy(() => import('../components/FaqModal'));
const SupportChatWidget = lazy(() => import('../components/SupportChatWidget'));
const SupportTicketsModal = lazy(() => import('../components/SupportTicketsModal'));
const MyReportsPage = lazy(() => import('./MyReportsPage'));
const AdminPage = lazy(() => import('./AdminPage'));

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
  created_at: string;
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
  const [friendsReports, setFriendsReports] = useState<any[]>([]);
  const [externalIncidents, setExternalIncidents] = useState<ExternalIncident[]>([]);
  const [circulationIncidents, setCirculationIncidents] = useState<ExternalIncident[]>([]);
  const [allCabanes, setAllCabanes] = useState<ExternalIncident[]>([]);
  const [problemTypes, setProblemTypes] = useState<ProblemType[]>([]);
  const [layerPrefs, setLayerPrefs] = useState<LayerPrefs>({
    signalements_mon511: true,
    signalements_amis: false,
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
  const [mapCamera, setMapCamera] = useState<{ lat: number; lng: number; zoom?: number; preserveZoomIfClose?: boolean } | null>(null);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [locationCheckStatus, setLocationCheckStatus] = useState<'checking' | 'denied' | 'imprecise' | null>(null);
  const [lastAccuracy, setLastAccuracy] = useState<number | null>(null);
  const pendingOverrideCoordsRef = useRef<{ lat: number; lng: number } | null>(null);
  const [placementMode, setPlacementMode] = useState(false);
  const [showLocationChoice, setShowLocationChoice] = useState(false);
  const [choiceAddressSearch, setChoiceAddressSearch] = useState('');
  const [choiceAddressResults, setChoiceAddressResults] = useState<GeocodingResult[]>([]);
  const [contextMenu, setContextMenu] = useState<{ lat: number; lng: number; x: number; y: number } | null>(null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [createModalCoords, setCreateModalCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationMethod, setLocationMethod] = useState<'map_click' | 'address_search' | 'gps' | null>(null);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [selection, setSelection] = useState<Selection>(null);
  const [showFiltersLegend, setShowFiltersLegend] = useState(false);
  const [mapType, setMapType] = useState<MapType>('default');
  const [showMapDetailsMenu, setShowMapDetailsMenu] = useState(false);
  const [showMapTypeMenu, setShowMapTypeMenu] = useState(false);
  const [showHelpMenu, setShowHelpMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showFaq, setShowFaq] = useState(false);
  const [showSupportChat, setShowSupportChat] = useState(false);
  const [showSupportTickets, setShowSupportTickets] = useState(false);
  const [ticketPrefill, setTicketPrefill] = useState<{ subject: string; description: string } | null>(null);
  const [supportUnread, setSupportUnread] = useState(false);
  const [bannerVisible, setBannerVisible] = useState(false);
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
      setShowHelpMenu(false);
      if (!target.closest('.topbar-mobile-menu-btn, .topbar-mobile-menu')) setShowMobileMenu(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  const [showAbout, setShowAbout] = useState(false);
  const [showMyReports, setShowMyReports] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMessaging, setShowMessaging] = useState(false);
  const showMessagingRef = useRef(false);
  showMessagingRef.current = showMessaging;
  const [messageToast, setMessageToast] = useState<any>(null);
  const [showFriends, setShowFriends] = useState(false);
  const [messagingStartUserId, setMessagingStartUserId] = useState<string | null>(null);
  const [viewingProfileUserId, setViewingProfileUserId] = useState<string | null>(null);
  const [unreadMessagesCount, setUnreadMessagesCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    reports: true, cabanes: true, feux: true, avertissements: true, travaux: true,
  });
  function toggleSection(key: string) {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }
  const [panelCollapsed, setPanelCollapsed] = useState(window.innerWidth <= 760);

  const [searchText, setSearchText] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [currentAreaName, setCurrentAreaName] = useState('');

  // Le titre de l'onglet du navigateur suit la ville actuellement visionnée
  // — comme le champ de recherche, se remet à 'mon511.ca' si aucune ville
  // n'est encore connue (ex. tout premier chargement).
  useEffect(() => {
    document.title = currentAreaName ? `${currentAreaName} — mon511.ca` : 'mon511.ca';
  }, [currentAreaName]);
  const [citySuggestions, setCitySuggestions] = useState<GeocodingResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [searchHistory, setSearchHistory] = useState<string[]>([]);
  const [filterTypeIds, setFilterTypeIds] = useState<Set<string>>(new Set());
  const [filterStatus, setFilterStatus] = useState<'all' | 'unresolved' | 'resolved'>('unresolved');

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
    if (!authenticated) { setUnreadMessagesCount(0); return; }
    api.get<number>('/messaging/unread-count').then(setUnreadMessagesCount).catch(() => {});
  }, [authenticated, showMessaging]);

  // Bulle flottante style Teams — s'affiche peu importe où l'usager se
  // trouve sur le site (pas seulement si le panneau de messagerie est
  // déjà ouvert, où elle serait redondante avec le fil de discussion
  // déjà visible).
  useEffect(() => {
    if (!authenticated) return;
    const socket = getSocket();
    if (!socket) return;
    function handleToast(toast: any) {
      if (showMessagingRef.current) return;
      setMessageToast(toast);
      setUnreadMessagesCount((c) => c + 1);
    }
    socket.on('message-toast', handleToast);
    return () => { socket.off('message-toast', handleToast); };
  }, [authenticated]);

  useEffect(() => {
    if (!authenticated || !layerPrefs.signalements_amis) { setFriendsReports([]); return; }
    api.get<any[]>('/friends/reports').then(setFriendsReports).catch(() => {});
  }, [authenticated, layerPrefs.signalements_amis]);

  useEffect(() => {
    if (authenticated) {
      api.get<any>('/users/me').then((me) => {
        // Fusion avec les défauts plutôt que remplacement direct — les
        // préférences côté serveur ne couvrent historiquement que 2 des
        // couches (travaux_routiers, conditions_hivernales), un
        // remplacement direct aurait fait perdre le défaut "activé" des
        // autres couches (dont signalements_mon511) pour tout usager
        // connecté.
        if (me.map_layer_preferences) setLayerPrefs({ ...DEFAULT_LAYER_PREFS, ...me.map_layer_preferences });
        setCurrentUserId(me.id);
      }).catch((err) => {
        // Le jeton stocké dans localStorage existe (authenticated est
        // vrai — voir App.tsx, qui ne vérifie que la présence du jeton,
        // pas sa validité) mais n'est plus valide côté serveur (expiré,
        // ou compte modifié depuis). Sans ce catch, currentUserId ne se
        // fixait jamais, laissant l'usager dans un état bloqué où
        // l'interface le montre "connecté" mais où presque rien ne
        // fonctionne réellement — exactement "comme si je n'étais plus
        // connecté", sans façon claire de s'en sortir. Une déconnexion
        // propre et automatique est la bonne réponse à un jeton invalide.
        if (err instanceof Error && err.message.toLowerCase().includes('unauthorized')) {
          clearToken();
          onLogout();
        }
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
      // Sans ce délai, un appel qui reste "en attente" indéfiniment (ex.
      // invite de permission jamais résolue à temps) bloque `locating` à
      // `true` pour toujours — le bouton (disabled={locating}) reste alors
      // désactivé en permanence, sans aucun moyen de réessayer.
      { timeout: 10000, maximumAge: 0 },
    );
  }

  // Seuil au-delà duquel on considère que ce n'est pas une vraie position
  // GPS mais une approximation par IP (VPN ou non) — un GPS d'appareil
  // réel rapporte généralement une précision de 5 à 50m ; une position par
  // IP rapporte typiquement 1000m et plus. 100m laisse une bonne marge
  // pour un GPS un peu lent à se stabiliser sans laisser passer l'IP.
  const REQUIRED_GPS_ACCURACY_M = 100;

  /** Exige une position GPS précise et fraîche AVANT d'ouvrir le formulaire
   * de signalement — pas pour naviguer sur le site, seulement au moment de
   * vouloir signaler quelque chose. Une adresse tapée à la main reste
   * possible ENSUITE dans le formulaire (pour ajuster ou signaler pour
   * quelqu'un d'autre), mais il faut d'abord prouver que l'appareil a une
   * vraie localisation précise activée. */
  function requireLocationThenCreate(overrideCoords?: { lat: number; lng: number }) {
    pendingOverrideCoordsRef.current = overrideCoords ?? null;
    if (!navigator.geolocation) {
      setLocationCheckStatus('denied');
      return;
    }
    setLocationCheckStatus('checking');

    // Une seule lecture instantanée (getCurrentPosition) peut être de
    // mauvaise qualité, surtout à l'intérieur d'un bâtiment — le GPS
    // s'améliore souvent après quelques secondes le temps de capter plus
    // de satellites. On observe plusieurs lectures pendant une courte
    // fenêtre et on garde la meilleure plutôt que la toute première.
    let best: GeolocationPosition | null = null;
    let settled = false;
    const watchWindowMs = 6000;

    const finish = (pos: GeolocationPosition) => {
      const { latitude, longitude, accuracy } = pos.coords;
      setLastAccuracy(accuracy);
      if (accuracy > REQUIRED_GPS_ACCURACY_M) {
        setLocationCheckStatus('imprecise');
        return;
      }
      setLocationCheckStatus(null);
      // La vérification prouve que l'appareil a une vraie localisation
      // précise activée — mais pour « Signaler ici » (clic droit), c'est
      // l'endroit cliqué sur la carte qui doit être utilisé pour le
      // signalement, pas nécessairement la position actuelle de la
      // personne (utile pour signaler un endroit qu'on regarde sans y
      // être physiquement).
      setCreateModalCoords(pendingOverrideCoordsRef.current ?? { lat: latitude, lng: longitude });
      setLocationMethod(pendingOverrideCoordsRef.current ? 'map_click' : 'gps');
      setShowCreateModal(true);
    };

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        if (!best || pos.coords.accuracy < best.coords.accuracy) best = pos;
        // Assez précis tout de suite — pas besoin d'attendre la fin de la
        // fenêtre, autant conclure immédiatement.
        if (pos.coords.accuracy <= REQUIRED_GPS_ACCURACY_M && !settled) {
          settled = true;
          navigator.geolocation.clearWatch(watchId);
          finish(pos);
        }
      },
      () => {
        if (!settled) {
          settled = true;
          navigator.geolocation.clearWatch(watchId);
          setLocationCheckStatus('denied');
        }
      },
      { enableHighAccuracy: true, timeout: watchWindowMs, maximumAge: 0 },
    );

    // Fin de la fenêtre d'observation — si rien d'assez précis n'est
    // arrivé entre-temps, on conclut avec la meilleure lecture obtenue.
    setTimeout(() => {
      if (settled) return;
      settled = true;
      navigator.geolocation.clearWatch(watchId);
      if (best) finish(best);
      else setLocationCheckStatus('denied');
    }, watchWindowMs);
  }

  function retryLocationCheck() {
    requireLocationThenCreate(pendingOverrideCoordsRef.current ?? undefined);
  }

  /** Ouvre directement le formulaire à l'endroit cliqué — sans exiger de
   * vérification GPS. Un clic délibéré et précis sur la carte (bureau)
   * est déjà en soi la preuve d'un choix intentionnel de position ; la
   * géolocalisation d'un ordinateur de bureau est de toute façon souvent
   * peu fiable (approximation par IP/Wi-Fi plutôt qu'un vrai GPS), donc
   * l'y exiger n'aurait fait qu'empêcher les usagers de bureau de
   * signaler quoi que ce soit. */
  function openCreateAtCoords(lat: number, lng: number, method: 'map_click' | 'address_search' = 'map_click') {
    setCreateModalCoords({ lat, lng });
    setLocationMethod(method);
    setShowCreateModal(true);
  }

  /** Bouton "Signaler" — sur bureau (peu de chances d'avoir un vrai GPS),
   * ouvre l'outil "cliquer sur la carte pour choisir l'emplacement" plutôt
   * que d'exiger le GPS. Sur mobile, garde l'exigence GPS stricte
   * (requireLocationThenCreate), puisque le GPS d'un téléphone est
   * généralement fiable et reste la meilleure protection contre les
   * fausses positions. */
  /** Toujours essayer le vrai GPS d'abord, peu importe l'appareil — un
   * ordinateur de bureau équipé d'une puce cellulaire/GPS réelle (rare
   * mais ça existe) doit pouvoir s'en servir tout comme un téléphone.
   * Seulement si le GPS échoue ou est trop imprécis (locationCheckStatus
   * passe à 'denied'/'imprecise'), un bouton "Choisir sur la carte"
   * apparaît pour se rabattre sur l'outil de placement manuel. */
  /** Affiche le choix entre les 3 façons d'indiquer l'emplacement, plutôt
   * que de tenter le GPS en silence et de proposer une alternative
   * seulement après un échec — plus clair d'entrée de jeu pour les
   * usagers qui savent déjà ne pas avoir de GPS précis disponible
   * (ordinateur de bureau, entre autres). */
  function startReporting() {
    setShowLocationChoice(true);
    setChoiceAddressSearch('');
    setChoiceAddressResults([]);
  }

  useEffect(() => {
    if (choiceAddressSearch.trim().length < 3) { setChoiceAddressResults([]); return; }
    const timeout = setTimeout(() => {
      searchCities(choiceAddressSearch, 5).then(setChoiceAddressResults);
    }, 350);
    return () => clearTimeout(timeout);
  }, [choiceAddressSearch]);



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

    // Liens directs venant des courriels (signalement reçu/approuvé/refusé,
    // rappel de validité) — jusqu'ici jamais lus, le lien n'ouvrait rien.
    const params = new URLSearchParams(window.location.search);
    const reportId = params.get('report') ?? params.get('editReport');
    if (reportId) {
      openReportById(reportId);
      // Nettoie l'URL après coup — évite de rouvrir le même signalement à
      // chaque rafraîchissement de la page.
      window.history.replaceState({}, '', window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sonde périodiquement s'il y a une réponse non lue de l'équipe (billet
  // ou chat) — fait flasher l'icône Aide. Le sessionId anonyme (même clé
  // que le widget de chat) permet de couvrir aussi les visiteurs sans
  // compte.
  useEffect(() => {
    function checkUnread() {
      const sessionId = localStorage.getItem('mon511_support_session') ?? '';
      api.get<{ hasUnread: boolean }>(`/support/unread-status?sessionId=${sessionId}`)
        .then((r) => setSupportUnread(r.hasUnread))
        .catch(() => {});
    }
    checkUnread();
    const interval = setInterval(checkUnread, 60000);
    return () => clearInterval(interval);
  }, [showSupportChat, showSupportTickets]);

  function openReport(r: Report) {
    setSelection({ type: 'report', id: r.id });
    setMapCamera({ lat: r.latitude, lng: r.longitude, preserveZoomIfClose: true });
  }

  /** Ouvre un signalement dont on n'a que l'id (ex. depuis une notification)
   * — va chercher ses coordonnées pour centrer la carte dessus. */
  async function openReportById(id: string) {
    setSelection({ type: 'report', id });
    try {
      const r = await api.get<any>(`/reports/${id}`);
      if (r.latitude && r.longitude) setMapCamera({ lat: r.latitude, lng: r.longitude, preserveZoomIfClose: true });
    } catch {
      // Le panneau de détail affichera son propre message d'erreur si le
      // signalement est introuvable — pas besoin de dupliquer ici.
    }
  }

  function openExternal(inc: ExternalIncident) {
    setSelection({ type: 'external', id: inc.id });
    setMapCamera({ lat: inc.latitude, lng: inc.longitude, preserveZoomIfClose: true });
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
    if (!layerPrefs.signalements_mon511) return [];
    return reports.filter((r) => {
      if (!withinBounds(r.latitude, r.longitude)) return false;
      if (filterTypeIds.size > 0 && r.problemTypeId && !filterTypeIds.has(r.problemTypeId)) return false;
      if (filterStatus === 'unresolved' && r.status === 'published_resolved') return false;
      if (filterStatus === 'resolved' && r.status !== 'published_resolved') return false;
      if (searchLower && !`${r.problemTypeNameFr} ${r.problemTypeNameEn ?? ''} ${r.addressText ?? ''} ${r.description ?? ''}`.toLowerCase().includes(searchLower)) return false;
      return true;
    });
  }, [reports, filterTypeIds, filterStatus, searchLower, viewBounds, layerPrefs.signalements_mon511]);

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

  // Signalements des amis — icône avec un petit cœur en superposition pour
  // les distinguer visuellement des signalements communautaires normaux,
  // sans dupliquer un pin déjà affiché par la couche principale (un ami
  // peut aussi apparaître dans reportPins si les deux couches sont
  // activées en même temps).
  const friendReportPins: MapPin[] = layerPrefs.signalements_amis
    ? friendsReports
        .filter((r) => withinBounds(r.latitude, r.longitude) && !filteredReports.some((fr) => fr.id === r.id))
        .map((r) => ({
          id: r.id,
          latitude: r.latitude,
          longitude: r.longitude,
          icon: '💜',
          colorVar: r.status === 'published_resolved' ? 'resolved' : 'unresolved',
          onClick: () => openReportById(r.id),
        }))
    : [];

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
    <Suspense fallback={null}>
    <div className="app-full" style={{ '--banner-h': bannerVisible ? '38px' : '0px' } as React.CSSProperties}>
      <LoadingScreen visible={showInitialLoader} />
      <SiteBanner lang={lang} onVisibleChange={setBannerVisible} />
      {showAdmin && <AdminPage onClose={() => setShowAdmin(false)} />}
      {showMyReports && !showAdmin && <MyReportsPage onClose={() => setShowMyReports(false)} lang={lang} />}
      {!showAdmin && !showMyReports && <>
      <div className="map-background">
        <MapView
          center={mapCamera}
          pins={[...reportPins, ...friendReportPins, ...officialPins]}
          lines={[...conditionLines, ...circulationLines]}
          userLocation={userLocation}
          fullBleed
          theme={theme}
          onViewportChange={handleViewportChange}
          mapType={mapType}
          onMapClick={(lat, lng, x, y) => setContextMenu({ lat, lng, x, y })}
          onUserZoomOut={() => setSelection(null)}
          placementModeActive={placementMode}
          onPlacementClick={(lat, lng) => { setPlacementMode(false); openCreateAtCoords(lat, lng); }}
          focusPinId={selection?.id ?? null}
          hoveredPinId={hoveredPinId}
        />
      </div>

      <header className="topbar-float">
        <div className="brand-row">
          <img src="/brand/header.png" alt="mon511.ca" style={{ height: 54, width: 'auto' }} />
        </div>

        {/* Barre normale — icônes individuelles, cachée seulement en très
            petite résolution (voir media query) au profit du menu ☰. */}
        <div className="topbar-actions">
          {authenticated ? (
            <>
              {isModerator && (
                <button className="icon-btn" title={t('administration', lang)} onClick={() => setShowAdmin(true)}>🛡️</button>
              )}
              <button className="icon-btn" title={lang === 'fr' ? 'Mes signalements' : 'My reports'} onClick={() => setShowMyReports(true)}>📋</button>
              <button className="icon-btn" title={lang === 'fr' ? 'Messages' : 'Messages'} onClick={() => { setMessagingStartUserId(null); setShowMessaging(true); }}>
                💬
                {unreadMessagesCount > 0 && <span className="badge-dot">{unreadMessagesCount}</span>}
              </button>
              <button className="icon-btn" title={lang === 'fr' ? 'Amis' : 'Friends'} onClick={() => setShowFriends(true)}>👥</button>
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

        {/* Menu ☰ — seul visible en très petite résolution (media query),
            regroupe exactement les mêmes actions avec leur libellé. */}
        <button className="topbar-mobile-menu-btn" onClick={() => setShowMobileMenu((v) => !v)} title={lang === 'fr' ? 'Menu' : 'Menu'}>
          ☰
          {(unreadCount + unreadMessagesCount) > 0 && <span className="badge-dot">{unreadCount + unreadMessagesCount}</span>}
        </button>
        {showMobileMenu && (
          <div className="topbar-mobile-menu">
            {authenticated ? (
              <>
                {isModerator && (
                  <div className="search-dropdown-item" onClick={() => { setShowAdmin(true); setShowMobileMenu(false); }}>🛡️ {t('administration', lang)}</div>
                )}
                <div className="search-dropdown-item" onClick={() => { setShowMyReports(true); setShowMobileMenu(false); }}>📋 {lang === 'fr' ? 'Mes signalements' : 'My reports'}</div>
                <div className="search-dropdown-item" onClick={() => { setMessagingStartUserId(null); setShowMessaging(true); setShowMobileMenu(false); }}>
                  💬 {lang === 'fr' ? 'Messages' : 'Messages'}{unreadMessagesCount > 0 ? ` (${unreadMessagesCount})` : ''}
                </div>
                <div className="search-dropdown-item" onClick={() => { setShowFriends(true); setShowMobileMenu(false); }}>👥 {lang === 'fr' ? 'Amis' : 'Friends'}</div>
                <div className="search-dropdown-item" onClick={() => { setShowNotifications(true); setShowMobileMenu(false); }}>
                  🔔 {lang === 'fr' ? 'Notifications' : 'Notifications'}{unreadCount > 0 ? ` (${unreadCount})` : ''}
                </div>
                <div className="search-dropdown-item" onClick={() => { setShowProfileModal(true); setShowMobileMenu(false); }}>👤 {t('monProfil', lang)}</div>
              </>
            ) : (
              <>
                <div className="search-dropdown-item" onClick={() => { onRequireAuth('login'); setShowMobileMenu(false); }}>🔑 {t('connexion', lang)}</div>
                <div className="search-dropdown-item" onClick={() => { onRequireAuth('register'); setShowMobileMenu(false); }}>✍️ {t('sinscrire', lang)}</div>
              </>
            )}
            <div className="search-dropdown-item" onClick={() => { toggleLang(); setShowMobileMenu(false); }}>
              🌐 {lang === 'fr' ? 'Passer en anglais' : 'Switch to French'}
            </div>
            <div className="search-dropdown-item" onClick={() => { onToggleTheme(); setShowMobileMenu(false); }}>
              {theme === 'dark' ? '🌙' : '☀️'} {t('changerTheme', lang)}
            </div>
            <div className="search-dropdown-item" onClick={() => { setShowAbout(true); setShowMobileMenu(false); }}>
              ℹ️ {lang === 'fr' ? 'À propos' : 'About'}
            </div>
          </div>
        )}
      </header>

      <aside className={`filters-panel-float ${selection ? 'mobile-hidden' : ''} ${panelCollapsed ? 'collapsed' : ''}`}>
        <h2 onClick={() => setPanelCollapsed((v) => !v)}>
          <span>🔍 {t('surLaCarte', lang)}</span>
          <button className="panel-collapse-btn" onClick={(e) => { e.stopPropagation(); setPanelCollapsed((v) => !v); }}>
            {panelCollapsed ? '+' : '−'}
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
              Object.values(layerPrefs).every((v) => !v) ? (
                <div className="center-msg">
                  {lang === 'fr' ? 'Aucun résultat possible sans sélectionner un détail de carte.' : 'No results possible without selecting a map detail.'}
                  <br />
                  <a
                    href="#"
                    onClick={(e) => { e.preventDefault(); setShowMapDetailsMenu(true); setShowMapTypeMenu(false); setShowFiltersLegend(false); setShowHelpMenu(false); }}
                    style={{ color: 'var(--accent-signal)', textDecoration: 'underline', cursor: 'pointer' }}
                  >
                    {lang === 'fr' ? 'Afficher les détails de carte' : 'Show map details'}
                  </a>
                </div>
              ) : (
                <div className="center-msg">{t('aucunSignalement', lang)}<br />{t('soisLePremier', lang)}</div>
              )
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
                    className="report-card rc-report-card"
                    style={{ borderColor: selection?.type === 'report' && selection.id === r.id ? 'var(--accent-signal)' : undefined }}
                    onClick={() => openReport(r)}
                    onMouseEnter={() => setHoveredPinId(r.id)}
                    onMouseLeave={() => setHoveredPinId(null)}
                  >
                    <div className="rc-report-top-row">
                      <div className="rc-title">{pickName(r.problemTypeNameFr, r.problemTypeNameEn, lang)}</div>
                      <span className={`pill ${statusPillClass(r.status)}`}>
                        {r.status === 'published_resolved' ? t('resolu', lang) : r.status === 'pending_moderation' ? (lang === 'fr' ? '⏳ En attente' : '⏳ Pending') : t('nonResolu', lang)}
                      </span>
                    </div>
                    <div className="rc-report-mid-row">
                      {r.thumbnailUrl ? (
                        <div className="rc-thumb-wrap">
                          <img src={r.thumbnailUrl} alt="" className={`rc-icon-hex rc-thumb ${r.status === 'published_resolved' ? 'resolved' : ''}`} />
                          <span className="rc-type-badge">{r.problemTypeIcon ?? '📍'}</span>
                        </div>
                      ) : (
                        <div className={`rc-icon-hex ${r.status === 'published_resolved' ? 'resolved' : ''}`}>
                          {r.problemTypeIcon ?? '📍'}
                        </div>
                      )}
                      <div className="rc-meta">{r.addressText ?? 'GPS'}</div>
                    </div>
                    <div className="rc-report-time">{timeAgo(r.created_at, lang)}</div>
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
          onStartConversation={(userId) => { setMessagingStartUserId(userId); setShowMessaging(true); }}
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
        onClick={() => { setShowFiltersLegend((v) => !v); setShowMapDetailsMenu(false); setShowMapTypeMenu(false); setShowHelpMenu(false); }}
        title={lang === 'fr' ? 'Filtres et légende' : 'Filters and legend'}
      >
        🎚️
        {activeFilterCount > 0 && <span className="badge-dot">{activeFilterCount}</span>}
      </button>
      {showFiltersLegend && (
        <div className="map-menu-panel" style={{ bottom: 264, width: 280, maxHeight: 'calc(100vh - 354px)' }}>
          <h3>{lang === 'fr' ? 'Filtres et légende' : 'Filters and legend'}</h3>

          <div className="filter-legend-group-title">{lang === 'fr' ? '🔧 Filtres' : '🔧 Filters'}</div>
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

          <div className="filter-legend-group-title">{lang === 'fr' ? '🗺️ Légende' : '🗺️ Legend'}</div>
          <div className="legend-section">
            <div className="legend-section-title">{lang === 'fr' ? 'Groupes de pins' : 'Pin clusters'}</div>
            <div className="legend-row"><div className="legend-swatch" style={{ background: 'var(--accent-signal)', borderRadius: '50%' }} /><span>{lang === 'fr' ? 'Signalements citoyens seulement' : 'Community reports only'}</span></div>
            <div className="legend-row"><div className="legend-swatch" style={{ background: 'var(--official-blue)', borderRadius: 3 }} /><span>{lang === 'fr' ? 'Données officielles seulement' : 'Official data only'}</span></div>
            <div className="legend-row"><div className="legend-swatch" style={{ background: '#A56CFF', borderRadius: '50%' }} /><span>{lang === 'fr' ? 'Mélange des deux' : 'Mix of both'}</span></div>
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
        onClick={() => { setShowMapDetailsMenu((v) => !v); setShowMapTypeMenu(false); setShowFiltersLegend(false); setShowHelpMenu(false); }}
        title={lang === 'fr' ? 'Détails de la carte' : 'Map details'}
      >
        🗂️
        {Object.values(layerPrefs).filter(Boolean).length > 0 && (
          <span className="badge-dot">{Object.values(layerPrefs).filter(Boolean).length}</span>
        )}
      </button>
      {showMapDetailsMenu && (
        <div className="map-menu-panel" style={{ bottom: 208, width: 280, maxHeight: 'calc(100vh - 298px)' }}>
          <h3>{lang === 'fr' ? 'Détails de la carte' : 'Map details'}</h3>
          <div className="layer-toggle" style={{ marginBottom: 8 }}>
            <span style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>📍 {lang === 'fr' ? 'Signalements mon511' : 'mon511 reports'}</span>
            <ToggleSwitch on={layerPrefs.signalements_mon511} onToggle={() => toggleLayer('signalements_mon511')} />
          </div>
          {authenticated && (
            <div className="layer-toggle" style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 11.5, display: 'flex', alignItems: 'center', gap: 6 }}>💜 {lang === 'fr' ? 'Signalements de mes amis' : "My friends' reports"}</span>
              <ToggleSwitch on={layerPrefs.signalements_amis} onToggle={() => toggleLayer('signalements_amis')} />
            </div>
          )}
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
        className={`map-menu-btn ${showHelpMenu ? 'active' : ''} ${supportUnread ? 'help-btn-flash' : ''}`}
        style={{ bottom: 320 }}
        onClick={() => { setShowHelpMenu((v) => !v); setShowMapTypeMenu(false); setShowMapDetailsMenu(false); setShowFiltersLegend(false); }}
        title={lang === 'fr' ? 'Aide' : 'Help'}
      >
        {supportUnread ? '❗' : '❓'}
      </button>
      {showHelpMenu && (
        <div className="map-menu-panel" style={{ bottom: 320, width: 280, maxHeight: 'calc(100vh - 410px)' }}>
          <h3>{lang === 'fr' ? 'Aide' : 'Help'}</h3>
          <div
            className="search-dropdown-item"
            style={{ borderRadius: 8, padding: '10px 12px' }}
            onClick={() => { setShowHelpMenu(false); setShowFaq(true); }}
          >
            📖 {lang === 'fr' ? 'Foire aux questions (FAQ)' : 'Frequently Asked Questions (FAQ)'}
          </div>
          <div
            className="search-dropdown-item"
            style={{ borderRadius: 8, padding: '10px 12px' }}
            onClick={() => { setShowHelpMenu(false); setShowSupportChat(true); }}
          >
            💬 {lang === 'fr' ? 'Clavarder avec le support' : 'Chat with support'}
          </div>
          <div
            className="search-dropdown-item"
            style={{ borderRadius: 8, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            onClick={() => { setShowHelpMenu(false); setTicketPrefill(null); setShowSupportTickets(true); }}
          >
            <span>🎫 {lang === 'fr' ? 'Billets de support' : 'Support tickets'}</span>
            {supportUnread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent-signal)' }} />}
          </div>
        </div>
      )}

      <button
        className={`map-menu-btn ${showMapTypeMenu ? 'active' : ''}`}
        style={{ bottom: 152 }}
        onClick={() => { setShowMapTypeMenu((v) => !v); setShowMapDetailsMenu(false); setShowFiltersLegend(false); setShowHelpMenu(false); }}
        title={lang === 'fr' ? 'Type de carte' : 'Map type'}
      >
        🗺️
      </button>
      {showMapTypeMenu && (
        <div className="map-menu-panel" style={{ bottom: 152, maxHeight: 'calc(100vh - 242px)' }}>
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

      <button className="fab" onClick={() => (authenticated ? startReporting() : onRequireAuth())}>
        <span style={{ fontSize: 18 }}>➕</span>
        <span>{t('signaler', lang)}</span>
      </button>

      <div className="stats-badge-float">
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-resolved)' }} />
        <strong>{filteredReports.length}</strong>
        <span>{lang === 'fr' ? 'signalements visibles' : 'visible reports'}</span>
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, marginLeft: 10, paddingLeft: 10, borderLeft: '1px solid var(--panel-border)', cursor: 'pointer', fontSize: 11 }}>
          <input
            type="checkbox"
            checked={filterStatus === 'all'}
            onChange={(e) => setFilterStatus(e.target.checked ? 'all' : 'unresolved')}
            style={{ accentColor: 'var(--accent-signal)', width: 13, height: 13, cursor: 'pointer' }}
          />
          {lang === 'fr' ? 'Voir les résolus' : 'Show resolved'}
        </label>
      </div>

      {showLocationChoice && (
        <div className="modal-overlay" onClick={() => setShowLocationChoice(false)}>
          <div className="modal-card" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>
              {lang === 'fr' ? "Où se trouve le problème ?" : 'Where is the problem?'}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.5 }}>
              {lang === 'fr'
                ? "Choisis la façon la plus précise pour toi d'indiquer l'emplacement."
                : 'Choose whichever way is most precise for you to indicate the location.'}
            </p>

            <button
              className="btn-ghost"
              style={{ width: '100%', textAlign: 'left', marginBottom: 8, padding: '12px 14px' }}
              onClick={() => { setShowLocationChoice(false); requireLocationThenCreate(); }}
            >
              📍 {lang === 'fr' ? 'Utiliser ma position GPS' : 'Use my GPS location'}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontWeight: 400 }}>
                {lang === 'fr' ? "Le plus précis si ton appareil a un vrai GPS activé (téléphones surtout)." : 'Most precise if your device has real GPS enabled (mostly phones).'}
              </div>
            </button>

            <button
              className="btn-ghost"
              style={{ width: '100%', textAlign: 'left', marginBottom: 8, padding: '12px 14px' }}
              onClick={() => { setShowLocationChoice(false); setPlacementMode(true); }}
            >
              🗺️ {lang === 'fr' ? 'Cliquer sur la carte' : 'Click on the map'}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, fontWeight: 400 }}>
                {lang === 'fr' ? "Idéal sur ordinateur, ou pour signaler un endroit que tu regardes sans y être." : 'Ideal on desktop, or to report a spot you\'re looking at without being there.'}
              </div>
            </button>

            <div className="btn-ghost" style={{ width: '100%', padding: '12px 14px', position: 'relative', cursor: 'default' }}>
              🔍 {lang === 'fr' ? 'Rechercher une adresse' : 'Search an address'}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, marginBottom: 8, fontWeight: 400 }}>
                {lang === 'fr' ? "Puis clique sur le bon résultat." : 'Then click the right result.'}
              </div>
              <input
                className="text-input"
                placeholder={lang === 'fr' ? 'Ex. 164 chemin Craig, Danville' : 'Ex. 164 Craig road, Danville'}
                value={choiceAddressSearch}
                onChange={(e) => setChoiceAddressSearch(e.target.value)}
                onClick={(e) => e.stopPropagation()}
              />
              {choiceAddressResults.length > 0 && (
                <div className="search-dropdown" style={{ position: 'relative', marginTop: 4 }}>
                  {choiceAddressResults.map((r, i) => (
                    <div
                      key={i}
                      className="search-dropdown-item"
                      onClick={() => { setShowLocationChoice(false); openCreateAtCoords(r.lat, r.lng, 'address_search'); }}
                    >
                      <span>📍</span><span>{r.name}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {placementMode && (
        <div
          style={{
            position: 'absolute', top: 'calc(var(--banner-h, 0px) + 20px)', left: '50%', transform: 'translateX(-50%)',
            zIndex: 60, background: 'var(--panel-solid)', border: '1px solid var(--accent-signal)', borderRadius: 12,
            boxShadow: 'var(--shadow-panel)', padding: '12px 18px', display: 'flex', alignItems: 'center', gap: 14,
          }}
        >
          <span style={{ fontSize: 13 }}>
            🎯 {lang === 'fr' ? "Clique sur la carte pour choisir l'emplacement exact du signalement." : 'Click on the map to choose the exact location for your report.'}
          </span>
          <button className="btn-ghost" style={{ fontSize: 11.5 }} onClick={() => setPlacementMode(false)}>
            {lang === 'fr' ? 'Annuler' : 'Cancel'}
          </button>
        </div>
      )}

      {locationCheckStatus && (
        <div className="modal-overlay" onClick={() => locationCheckStatus !== 'checking' && setLocationCheckStatus(null)}>
          <div className="modal-card" style={{ maxWidth: 380, textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
            {locationCheckStatus === 'checking' && (
              <>
                <div style={{ fontSize: 32, marginBottom: 12 }}>📍</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
                  {lang === 'fr' ? 'Vérification de ta position...' : 'Checking your location...'}
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                  {lang === 'fr'
                    ? "Accepte la demande de localisation de ton navigateur si elle apparaît. Ça peut prendre quelques secondes pour affiner la précision, surtout à l'intérieur."
                    : "Accept your browser's location prompt if it appears. This can take a few seconds to fine-tune accuracy, especially indoors."}
                </p>
              </>
            )}
            {locationCheckStatus === 'denied' && (
              <>
                <div style={{ fontSize: 32, marginBottom: 12 }}>🚫</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
                  {lang === 'fr' ? 'Position précise requise' : 'Precise location required'}
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 16 }}>
                  {lang === 'fr'
                    ? "mon511.ca exige une position GPS précise pour signaler un problème, afin de garantir des signalements fiables pour la communauté. Active la localisation dans les réglages de ton navigateur ou de ton appareil, puis réessaie."
                    : 'mon511.ca requires a precise GPS location to submit a report, to keep reports reliable for the community. Enable location in your browser or device settings, then try again.'}
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="btn-primary" onClick={() => retryLocationCheck()}>
                    {lang === 'fr' ? 'Réessayer' : 'Try again'}
                  </button>
                  <button className="btn-ghost" onClick={() => { setLocationCheckStatus(null); setPlacementMode(true); }}>
                    {lang === 'fr' ? 'Choisir sur la carte' : 'Choose on map'}
                  </button>
                  <button className="btn-ghost" onClick={() => setLocationCheckStatus(null)}>
                    {lang === 'fr' ? 'Annuler' : 'Cancel'}
                  </button>
                </div>
              </>
            )}
            {locationCheckStatus === 'imprecise' && (
              <>
                <div style={{ fontSize: 32, marginBottom: 12 }}>⚠️</div>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
                  {lang === 'fr' ? 'Position pas assez précise' : 'Location not precise enough'}
                </div>
                <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 16 }}>
                  {lang === 'fr'
                    ? `Ta position actuelle n'est précise qu'à environ ${Math.round(lastAccuracy ?? 0)} m — probablement une estimation par réseau plutôt que le GPS réel de ton appareil. Assure-toi que la localisation "précise" (pas juste approximative) est activée, idéalement à l'extérieur ou près d'une fenêtre, puis réessaie.`
                    : `Your current location is only accurate to about ${Math.round(lastAccuracy ?? 0)} m — likely a network estimate rather than your device's real GPS. Make sure "precise" (not just approximate) location is enabled, ideally outdoors or near a window, then try again.`}
                </p>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="btn-primary" onClick={() => retryLocationCheck()}>
                    {lang === 'fr' ? 'Réessayer' : 'Try again'}
                  </button>
                  <button className="btn-ghost" onClick={() => { setLocationCheckStatus(null); setPlacementMode(true); }}>
                    {lang === 'fr' ? 'Choisir sur la carte' : 'Choose on map'}
                  </button>
                  <button className="btn-ghost" onClick={() => setLocationCheckStatus(null)}>
                    {lang === 'fr' ? 'Annuler' : 'Cancel'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateReportModal
          initialCoords={createModalCoords}
          locationMethod={locationMethod}
          lang={lang}
          onClose={() => { setShowCreateModal(false); setCreateModalCoords(null); setLocationMethod(null); }}
          onCreated={() => {
            setShowCreateModal(false);
            setCreateModalCoords(null);
            setLocationMethod(null);
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
                openCreateAtCoords(lat, lng);
              }}
            >
              📍 {lang === 'fr' ? 'Signaler ici' : 'Report here'}
            </button>
          </div>
        </div>
      )}

      {showAbout && <AboutModal onClose={() => setShowAbout(false)} lang={lang} />}
      {showFaq && <FaqModal onClose={() => setShowFaq(false)} lang={lang} />}
      {showSupportChat && (
        <SupportChatWidget
          onClose={() => setShowSupportChat(false)}
          lang={lang}
          onOpenTicketForm={(prefill) => { setTicketPrefill(prefill); setShowSupportTickets(true); }}
        />
      )}
      {showSupportTickets && (
        <SupportTicketsModal onClose={() => setShowSupportTickets(false)} lang={lang} prefill={ticketPrefill} />
      )}
      {showNotifications && <NotificationsPanel onClose={() => setShowNotifications(false)} lang={lang} onOpenReport={openReportById} onUnreadCountChange={setUnreadCount} />}
      {messageToast && (
        <MessageToast
          toast={messageToast}
          onReply={() => {
            setMessagingStartUserId(messageToast.senderId);
            setShowMessaging(true);
            setMessageToast(null);
          }}
          onDismiss={() => setMessageToast(null)}
        />
      )}
      {showMessaging && (
        <MessagingPanel
          onClose={() => { setShowMessaging(false); setMessagingStartUserId(null); }}
          lang={lang}
          currentUserId={currentUserId}
          onUnreadCountChange={setUnreadMessagesCount}
          startWithUserId={messagingStartUserId}
          onViewProfile={(userId) => setViewingProfileUserId(userId)}
        />
      )}
      {showFriends && (
        <FriendsPanel
          onClose={() => setShowFriends(false)}
          lang={lang}
          onOpenConversation={(userId) => { setShowFriends(false); setMessagingStartUserId(userId); setShowMessaging(true); }}
          onViewProfile={(userId) => setViewingProfileUserId(userId)}
        />
      )}

      {viewingProfileUserId && (
        <PublicProfileModal
          userId={viewingProfileUserId}
          onClose={() => setViewingProfileUserId(null)}
          lang={lang}
          currentUserId={currentUserId}
          onStartConversation={(userId) => { setViewingProfileUserId(null); setMessagingStartUserId(userId); setShowMessaging(true); }}
        />
      )}

      {/* Mention de droits d'auteur, discrète — même esprit que l'attribution
          MapLibre/MapTiler déjà présente (en bas à droite), mais placée à
          gauche pour ne jamais se chevaucher ni gêner quoi que ce soit. */}
      <div
        style={{
          position: 'absolute', bottom: 4, left: 8, zIndex: 20, pointerEvents: 'none',
          fontSize: 9.5, color: 'rgba(245,246,248,0.35)', fontFamily: 'var(--font-mono)',
        }}
      >
        © mon511 — {lang === 'fr' ? 'Tous droits réservés' : 'All rights reserved'}
      </div>
      </>}
    </div>
    </Suspense>
  );
}
