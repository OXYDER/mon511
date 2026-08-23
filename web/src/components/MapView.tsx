import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { Map as MapLibreMap, Marker } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

export interface MapPin {
  id: string;
  latitude: number;
  longitude: number;
  icon: string;
  colorVar: 'unresolved' | 'resolved' | 'official';
  onClick?: () => void;
  photoUrl?: string | null;
  selected?: boolean;
  pending?: boolean;
}

export type MapType = 'default' | 'satellite';

export interface RoadLineFeature {
  id: string;
  geometry: any;
  color: string;
  onClick?: () => void;
}

interface Props {
  center: { lat: number; lng: number; zoom?: number; preserveZoomIfClose?: boolean } | null;
  pins: MapPin[];
  lines?: RoadLineFeature[];
  userLocation?: { lat: number; lng: number } | null;
  height?: number | string;
  fullBleed?: boolean;
  theme?: 'dark' | 'light';
  mapType?: MapType;
  onViewportChange?: (
    center: { lat: number; lng: number },
    radiusMeters: number,
    zoom: number,
    bounds: { north: number; south: number; east: number; west: number },
  ) => void;
  onMapClick?: (lat: number, lng: number, screenX: number, screenY: number) => void;
  onUserZoomOut?: () => void;
  selectedPinId?: string | null;
  /** Actif seulement pendant l'outil « cliquer pour choisir l'emplacement »
   * (bouton Signaler sur bureau) — un clic GAUCHE sur la carte déclenche
   * alors onPlacementClick, en plus du clic droit qui garde son
   * comportement habituel (menu contextuel « Signaler ici »). */
  placementModeActive?: boolean;
  onPlacementClick?: (lat: number, lng: number) => void;
  focusPinId?: string | null;
  hoveredPinId?: string | null;
}

/** Distance approximative en mètres entre deux points (formule haversine). */
function haversineDistance(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_API_KEY;

const PIN_COLORS: Record<MapPin['colorVar'], string> = {
  unresolved: '#F5B301',
  resolved: '#2FBF71',
  official: '#3B9CFF',
};

export default function MapView({ center, pins, lines = [], userLocation = null, height = 320, fullBleed = false, theme = 'dark', mapType = 'default', onViewportChange, onMapClick, onUserZoomOut, selectedPinId = null, placementModeActive = false, onPlacementClick, focusPinId = null, hoveredPinId = null }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  // Le clic gauche en mode placement est enregistré une seule fois à la
  // création de la carte (comme le clic droit) — des refs évitent que ce
  // gestionnaire garde en mémoire une valeur périmée de ces props, qui
  // changent dynamiquement pendant que la carte, elle, ne se recrée pas.
  const placementModeActiveRef = useRef(placementModeActive);
  placementModeActiveRef.current = placementModeActive;
  const onPlacementClickRef = useRef(onPlacementClick);
  onPlacementClickRef.current = onPlacementClick;
  const markersRef = useRef<Marker[]>([]);
  const pinElementsRef = useRef<Map<string, HTMLDivElement>>(new Map());
  const lastZoomRef = useRef<number | null>(null);
  const onUserZoomOutRef = useRef(onUserZoomOut);
  onUserZoomOutRef.current = onUserZoomOut;
  const styleRetriedRef = useRef(false);
  const popupsRef = useRef<maplibregl.Popup[]>([]);
  const popupsByIdRef = useRef<Record<string, { popup: maplibregl.Popup; lng: number; lat: number }>>({});
  const userMarkerRef = useRef<Marker | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linesClickMapRef = useRef<Record<string, () => void>>({});
  const [clusterVersion, setClusterVersion] = useState(0);
  const [spiderfiedClusterId, setSpiderfiedClusterId] = useState<string | null>(null);

  // Ref toujours à jour pour éviter les fermetures obsolètes dans les
  // gestionnaires d'événements enregistrés une seule fois.
  const linesRef = useRef<RoadLineFeature[]>(lines);
  linesRef.current = lines;

  function buildLinesGeoJson() {
    return {
      type: 'FeatureCollection' as const,
      features: linesRef.current
        .filter((l) => l.geometry)
        .map((l) => ({
          type: 'Feature' as const,
          geometry: l.geometry,
          properties: { id: l.id, color: l.color },
        })),
    };
  }

  function ensureLinesLayer() {
    const map = mapRef.current;
    if (!map) return;

    // Si le style n'est pas encore prêt, addSource/addLayer échoueraient
    // silencieusement — on réessaie automatiquement dès que le style est
    // chargé, plutôt que de perdre la mise à jour (ce qui arrivait quand
    // les données arrivaient avant la fin du chargement du style : la
    // couche restait vide en permanence, rien ne la resynchronisait après
    // coup).
    if (!map.isStyleLoaded()) {
      map.once('idle', () => ensureLinesLayer());
      return;
    }

    if (!map.getSource('road-conditions')) {
      map.addSource('road-conditions', { type: 'geojson', data: buildLinesGeoJson() as any });
      map.addLayer({
        id: 'road-conditions-layer',
        type: 'line',
        source: 'road-conditions',
        paint: { 'line-color': ['get', 'color'], 'line-width': 5, 'line-opacity': 0.9 },
        layout: { 'line-cap': 'round', 'line-join': 'round' },
      });
      map.on('click', 'road-conditions-layer', (e) => {
        const id = e.features?.[0]?.properties?.id;
        if (id) linesClickMapRef.current[id]?.();
      });
      map.on('mouseenter', 'road-conditions-layer', () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', 'road-conditions-layer', () => { map.getCanvas().style.cursor = ''; });
    } else {
      (map.getSource('road-conditions') as any)?.setData(buildLinesGeoJson());
    }
  }

  const spiderfyLegsRef = useRef<any[]>([]);

  function ensureSpiderfyLinesLayer() {
    const map = mapRef.current;
    if (!map) return;
    const data = { type: 'FeatureCollection' as const, features: spiderfyLegsRef.current };
    if (!map.getSource('spiderfy-legs')) {
      map.addSource('spiderfy-legs', { type: 'geojson', data: data as any });
      map.addLayer({
        id: 'spiderfy-legs-layer',
        type: 'line',
        source: 'spiderfy-legs',
        paint: { 'line-color': 'rgba(255,255,255,0.35)', 'line-width': 1.5, 'line-dasharray': [2, 2] },
      });
    } else {
      (map.getSource('spiderfy-legs') as any)?.setData(data);
    }
  }

  function styleUrlFor(t: 'dark' | 'light', type: MapType) {
    if (!MAPTILER_KEY) return 'https://demotiles.maplibre.org/style.json';
    if (type === 'satellite') return `https://api.maptiler.com/maps/hybrid/style.json?key=${MAPTILER_KEY}`;
    const styleName = t === 'dark' ? 'streets-v2-dark' : 'streets-v2-light';
    return `https://api.maptiler.com/maps/${styleName}/style.json?key=${MAPTILER_KEY}`;
  }

  // Initialisation de la carte une seule fois
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrlFor(theme, mapType),
      center: center ? [center.lng, center.lat] : [-71.8929, 45.4042],
      zoom: 12,
      // Désactive l'attribution par défaut (toujours dépliée) pour la
      // remplacer par une version compacte — juste le bouton "i", qui se
      // déplie seulement au clic, plutôt que le texte complet affiché en
      // permanence dès le chargement.
      attributionControl: false,
    });
    mapRef.current.addControl(new maplibregl.AttributionControl({ compact: true }));
    // Le CSS cache maintenant .maplibregl-ctrl-attrib-inner de façon
    // inconditionnelle (voir styles.css) — on gère nous-mêmes le clic sur
    // le bouton "i" pour basculer une classe qu'on contrôle entièrement,
    // plutôt que de dépendre de l'attribut open/classe interne de
    // MapLibre, qui s'ouvrait de lui-même au chargement selon sa propre
    // logique (largeur du conteneur).
    setTimeout(() => {
      const attribEl = containerRef.current?.querySelector('.maplibregl-ctrl-attrib');
      const summaryEl = attribEl?.querySelector('summary');
      summaryEl?.addEventListener('click', (e) => {
        e.preventDefault();
        attribEl?.classList.toggle('mon511-attrib-open');
      });
    }, 0);
    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current.on('style.load', ensureLinesLayer);
    mapRef.current.on('style.load', ensureSpiderfyLinesLayer);
    mapRef.current.on('style.load', () => { styleRetriedRef.current = false; });
    // Filet de sécurité supplémentaire : 'styledata' se déclenche plus
    // largement que 'style.load' (y compris lors d'une reconstruction
    // silencieuse du style par MapLibre après un incident, ex. perte de
    // contexte WebGL) — sans ça, nos couches personnalisées (conditions
    // routières, débit de circulation) peuvent rester invisibles après un
    // tel incident même si la carte elle-même s'est rétablie.
    mapRef.current.on('styledata', () => {
      if (!mapRef.current!.getLayer('road-conditions-layer')) ensureLinesLayer();
      if (!mapRef.current!.getSource('spiderfy-legs')) ensureSpiderfyLinesLayer();
    });

    // La perte du contexte WebGL (ressources graphiques, plusieurs onglets
    // ouverts, pilote graphique, etc.) fait disparaître tout ce qui est
    // dessiné. MapLibre se reconstruit généralement tout seul, mais on
    // force quand même un nouveau rendu de tous les pins une fois le
    // contexte restauré, pour être certain que rien ne reste invisible.
    mapRef.current.on('webglcontextlost', () => {
      console.warn('[MapView] Contexte WebGL perdu — récupération en cours...');
    });
    mapRef.current.on('webglcontextrestored', () => {
      console.warn('[MapView] Contexte WebGL restauré — redessin forcé.');
      setClusterVersion((v) => v + 1);
    });
    mapRef.current.on('error', (e) => {
      console.error('[MapView] Erreur MapLibre :', e.error);
      // Si c'est le tout premier chargement du style qui échoue (ex.
      // extension de blocage, hoquet réseau ponctuel), la carte reste
      // cassée en permanence sans ça — un simple nouvel essai résout la
      // grande majorité des cas transitoires.
      const message = (e.error as any)?.message ?? '';
      if (!styleRetriedRef.current && /style\.json|Failed to fetch|NetworkError/i.test(message)) {
        styleRetriedRef.current = true;
        console.warn('[MapView] Échec du chargement du style — nouvel essai dans 1.5s...');
        setTimeout(() => {
          if (mapRef.current) mapRef.current.setStyle(styleUrlFor(theme, mapType));
        }, 1500);
      }
    });

    // Les distances en pixels entre pins changent avec le zoom — il faut
    // recalculer les groupes. Le déplacement (pan) seul ne change pas ces
    // distances relatives, donc pas besoin de recalculer pour ça.
    mapRef.current.on('zoomend', (e) => {
      const newZoom = mapRef.current!.getZoom();
      // e.originalEvent n'existe QUE pour une vraie interaction de
      // l'usager (molette, pincement) — absent pour un flyTo() déclenché
      // par le code (ex. la révélation automatique d'un pin sélectionné).
      // Sans cette distinction, fermer la fiche du signalement au moindre
      // zoom programmé serait très gênant.
      const isUserZoomOut = !!(e as any).originalEvent && lastZoomRef.current !== null && newZoom < lastZoomRef.current;
      lastZoomRef.current = newZoom;
      setClusterVersion((v) => v + 1);
      // Un changement de zoom recalcule complètement les regroupements —
      // un groupe déjà ouvert (déployé en étoile) n'a plus de sens dans
      // ce nouveau contexte, mieux vaut le refermer plutôt que de le
      // laisser ouvert avec des pins qui ne correspondent plus.
      setSpiderfiedClusterId(null);
      if (isUserZoomOut) onUserZoomOutRef.current?.();
    });

    function triggerMapClickIfAllowed(lat: number, lng: number, point: { x: number; y: number }) {
      if (!onMapClick) return;
      if (mapRef.current!.getLayer('road-conditions-layer')) {
        const features = mapRef.current!.queryRenderedFeatures(point as any, { layers: ['road-conditions-layer'] });
        if (features.length > 0) return;
      }
      onMapClick(lat, lng, point.x, point.y);
    }

    // Clic droit sur desktop — équivalent "clic secondaire" des logiciels de
    // carte, n'entre pas en conflit avec le clic gauche normal de navigation.
    mapRef.current.on('contextmenu', (e) => {
      e.preventDefault();
      triggerMapClickIfAllowed(e.lngLat.lat, e.lngLat.lng, e.point);
    });

    // Clic gauche — ferme d'abord un regroupement déployé en étoile s'il y
    // en a un (clic "ailleurs" sur la carte, pas sur un pin — les pins
    // sont des marqueurs HTML séparés, ce clic sur le canevas de la carte
    // lui-même ne se déclenche donc jamais en cliquant vraiment sur un
    // pin). Sinon, comportement habituel du mode placement.
    mapRef.current.on('click', (e) => {
      setSpiderfiedClusterId(null);
      if (!placementModeActiveRef.current || !onPlacementClickRef.current) return;
      onPlacementClickRef.current(e.lngLat.lat, e.lngLat.lng);
    });

    // Appui long sur mobile — équivalent tactile du clic droit. Annulé si
    // le doigt bouge trop (c'est alors un glissement de carte, pas un appui
    // long) ou si le doigt est relâché avant le délai.
    const LONG_PRESS_MS = 550;
    const MOVE_CANCEL_PX = 10;
    let longPressTimer: ReturnType<typeof setTimeout> | null = null;
    let longPressStart: { x: number; y: number } | null = null;

    mapRef.current.on('touchstart', (e) => {
      if (e.points.length !== 1) return; // ignore le pincer-zoomer à deux doigts
      const point = e.point;
      longPressStart = { x: point.x, y: point.y };
      longPressTimer = setTimeout(() => {
        triggerMapClickIfAllowed(e.lngLat.lat, e.lngLat.lng, point);
        longPressStart = null;
      }, LONG_PRESS_MS);
    });
    mapRef.current.on('touchmove', (e) => {
      if (!longPressStart || !longPressTimer) return;
      const dx = e.point.x - longPressStart.x;
      const dy = e.point.y - longPressStart.y;
      if (Math.sqrt(dx * dx + dy * dy) > MOVE_CANCEL_PX) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    });
    mapRef.current.on('touchend', () => {
      if (longPressTimer) { clearTimeout(longPressTimer); longPressTimer = null; }
      longPressStart = null;
    });

    mapRef.current.on('moveend', () => {
      if (!mapRef.current || !onViewportChange) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        if (!mapRef.current) return;
        const c = mapRef.current.getCenter();
        const bounds = mapRef.current.getBounds();
        const centerPoint = { lat: c.lat, lng: c.lng };
        const radius = haversineDistance(centerPoint, { lat: bounds.getNorth(), lng: bounds.getEast() });
        onViewportChange(centerPoint, Math.max(radius, 500), mapRef.current.getZoom(), {
          north: bounds.getNorth(), south: bounds.getSouth(), east: bounds.getEast(), west: bounds.getWest(),
        });
      }, 400);
    });

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Changer le style de tuiles quand le thème ou le type de carte change, sans recréer la carte
  const isFirstStyleRender = useRef(true);
  useEffect(() => {
    // La carte est déjà construite avec le bon style dès sa création
    // (voir le useEffect d'initialisation plus haut) — sans cette garde,
    // ce useEffect se déclenche AUSSI au tout premier montage (comportement
    // normal de React pour un effet avec dépendances) et relance setStyle()
    // avec le MÊME style, avant même que le premier ait fini de charger.
    // MapLibre corrompt alors son état interne dès le départ à chaque
    // chargement de page ('Style is not done loading.. Rebuilding the
    // style from scratch'), ce qui peut faire disparaître nos couches
    // personnalisées.
    if (isFirstStyleRender.current) {
      isFirstStyleRender.current = false;
      return;
    }
    if (mapRef.current) {
      mapRef.current.setStyle(styleUrlFor(theme, mapType));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, mapType]);

  // Recentrer quand la position change
  useEffect(() => {
    if (mapRef.current && center) {
      const map = mapRef.current;
      // Force MapLibre à relire les vraies dimensions actuelles du
      // conteneur avant de centrer — sans ça, le tout premier flyTo() après
      // le chargement de la page peut se baser sur des dimensions pas
      // encore stabilisées (mise en page encore en cours de finalisation),
      // produisant un atterrissage décalé qui ne se reproduit plus aux
      // appels suivants (une fois les dimensions réellement à jour).
      map.resize();
      // Annule toute animation de caméra encore en vol avant d'en démarrer
      // une nouvelle — sans ça, deux flyTo() rapprochés peuvent se marcher
      // sur les pieds et produire un atterrissage décalé.
      map.stop();

      // L'option padding de flyTo() s'est avérée peu fiable dans certains
      // cas précis (ex. un pin déjà visible près du bord, à un zoom très
      // différent du zoom cible) — atterrissage décalé au mauvais endroit,
      // parfois de façon spectaculaire, plutôt que la petite correction
      // attendue. Les deux panneaux étant presque symétriques (340px vs
      // 360px), un centrage simple sans padding du tout donne déjà un
      // résultat pratiquement identique à l'idéal (écart théorique de 10px
      // à peine, imperceptible) — plus simple et surtout fiable.

      // Clic sur un pin : ne jamais dézoomer si on est déjà assez proche —
      // seulement centrer sur le pin. Si le zoom actuel est trop éloigné
      // pour bien voir le pin, on zoome à un niveau raisonnable (17),
      // comme avant. Le seuil de 15 correspond à peu près à l'échelle
      // d'un quartier/une rue — en dessous, un pin isolé serait difficile
      // à distinguer sans se rapprocher.
      const MIN_CLOSE_ZOOM = 15;
      const DEFAULT_CLOSE_ZOOM = 17;
      let targetZoom = center.zoom ?? 13;
      if (center.preserveZoomIfClose) {
        const currentZoom = map.getZoom();
        targetZoom = currentZoom >= MIN_CLOSE_ZOOM ? currentZoom : DEFAULT_CLOSE_ZOOM;
      }

      map.flyTo({ center: [center.lng, center.lat], zoom: targetZoom, duration: 800 });
    }
  }, [center]);

  // Fermer un regroupement déployé en étoile dès qu'on navigue ailleurs
  // (ex. clic sur un signalement à l'intérieur du déploiement, qui ouvre
  // son détail) — le seul zoomend ne suffisait pas dans ce cas précis
  // (openReport() peut parfois garder exactement le même niveau de zoom,
  // ne déclenchant alors aucun événement de zoom réel). center change à
  // chaque navigation, peu importe si le zoom bouge vraiment ou non.
  useEffect(() => {
    setSpiderfiedClusterId(null);
  }, [center]);

  // Curseur en croix pendant le mode placement — signal visuel clair que
  // le prochain clic sur la carte va déterminer l'emplacement du
  // signalement.
  useEffect(() => {
    if (!mapRef.current) return;
    mapRef.current.getCanvas().style.cursor = placementModeActive ? 'crosshair' : '';
  }, [placementModeActive]);

  // Redessiner les pins à chaque changement de liste
  /** Regroupe les pins proches à l'écran (pas en distance réelle — la
   * proximité visuelle dépend du zoom). Algorithme glouton simple, largement
   * suffisant pour les volumes affichés ici (quelques centaines de pins
   * visibles au maximum, grâce au filtrage déjà fait sur le cadre visible). */
  function clusterPins(inputPins: MapPin[], map: MapLibreMap, pixelRadius = 42) {
    const points = inputPins.map((pin) => ({ pin, screen: map.project([pin.longitude, pin.latitude]) }));
    const used = new Array(points.length).fill(false);
    const clusters: { id: string; lat: number; lng: number; pins: MapPin[] }[] = [];

    for (let i = 0; i < points.length; i++) {
      if (used[i]) continue;
      const group = [points[i]];
      used[i] = true;
      for (let j = i + 1; j < points.length; j++) {
        if (used[j]) continue;
        const dx = points[i].screen.x - points[j].screen.x;
        const dy = points[i].screen.y - points[j].screen.y;
        if (Math.sqrt(dx * dx + dy * dy) < pixelRadius) {
          group.push(points[j]);
          used[j] = true;
        }
      }
      const cx = group.reduce((s, p) => s + p.screen.x, 0) / group.length;
      const cy = group.reduce((s, p) => s + p.screen.y, 0) / group.length;
      const center = map.unproject([cx, cy]);
      clusters.push({
        id: group.map((g) => g.pin.id).sort().join('|'),
        lat: center.lat,
        lng: center.lng,
        pins: group.map((g) => g.pin),
      });
    }
    return clusters;
  }

  function buildPinElement(pin: MapPin) {
    const el = document.createElement('div');
    pinElementsRef.current.set(pin.id, el);
    el.style.width = '32px';
    el.style.height = '32px';
    el.style.cursor = pin.onClick ? 'pointer' : 'default';
    el.style.borderRadius = '50%';
    el.style.background = '#1B1E25';
    el.style.boxShadow = pin.selected
      ? '0 0 0 3px #FF2D3B, 0 0 0 6px rgba(255,45,59,0.35), 0 2px 6px rgba(0,0,0,0.4)'
      : '0 2px 6px rgba(0,0,0,0.4)';
    el.style.border = pin.pending ? `2.5px dashed ${PIN_COLORS[pin.colorVar]}` : `2.5px solid ${PIN_COLORS[pin.colorVar]}`;
    if (pin.pending) el.style.opacity = '0.75';
    el.style.display = 'flex';
    el.style.alignItems = 'center';
    el.style.justifyContent = 'center';
    el.style.fontSize = '14px';
    el.textContent = pin.icon;

    let photoPopup: maplibregl.Popup | undefined;
    if (pin.photoUrl) {
      photoPopup = new maplibregl.Popup({ offset: 20, closeButton: false, closeOnClick: false, className: 'pin-thumb-popup' })
        .setHTML(`<img src="${pin.photoUrl}" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:8px;display:block;" />`);
      popupsRef.current.push(photoPopup);
      popupsByIdRef.current[pin.id] = { popup: photoPopup, lng: pin.longitude, lat: pin.latitude };
      el.addEventListener('mouseenter', () => photoPopup!.setLngLat([pin.longitude, pin.latitude]).addTo(mapRef.current!));
      el.addEventListener('mouseleave', () => photoPopup!.remove());
    }

    if (pin.onClick) {
      el.addEventListener('click', () => {
        photoPopup?.remove(); // évite qu'elle reste "coincée" sur tactile, où mouseleave ne se déclenche pas naturellement
        pin.onClick!();
      });
    }
    return el;
  }

  // Signature stable du contenu des pins, EXCLUANT le champ selected —
  // le tableau pins reçu en prop obtient une nouvelle référence à chaque
  // changement de sélection (le composant parent le reconstruit avec
  // .map() à chaque rendu), ce qui forçait l'effet ci-dessous à détruire
  // et reconstruire TOUS les marqueurs de la carte à chaque clic sur un
  // signalement — la vraie cause du besoin de cliquer deux fois pour en
  // sélectionner un autre. Cette chaîne reste identique tant que le
  // CONTENU réel des pins ne change pas, même si la référence du tableau,
  // elle, change à chaque rendu — utilisée comme dépendance à la place
  // de pins directement, ça évite la reconstruction inutile.
  const pinsSignature = useMemo(
    () => pins.map((p) => `${p.id}:${p.latitude}:${p.longitude}:${p.icon}:${p.colorVar}:${p.pending}:${p.photoUrl}`).join('|'),
    [pins],
  );

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
    pinElementsRef.current.clear();
    popupsRef.current.forEach((p) => p.remove());
    popupsRef.current = [];
    popupsByIdRef.current = {};
    spiderfyLegsRef.current = [];

    const clusters = clusterPins(pins, map);

    for (const cluster of clusters) {
      if (cluster.pins.length === 1) {
        // Pin isolé — comportement normal, position réelle.
        const pin = cluster.pins[0];
        const marker = new maplibregl.Marker({ element: buildPinElement(pin) })
          .setLngLat([pin.longitude, pin.latitude])
          .addTo(map);
        markersRef.current.push(marker);
        continue;
      }

      if (cluster.id === spiderfiedClusterId) {
        // Déployé en éventail : chaque pin à une position calculée en
        // cercle autour du centre du groupe, avec un fil de connexion.
        const centerScreen = map.project([cluster.lng, cluster.lat]);
        // Le rayon doit rester SOUS le seuil de regroupement (42px, voir
        // pixelRadius dans clusterPins) — sinon les pins déployés peuvent
        // déborder jusqu'à chevaucher un pin ou un autre regroupement
        // voisin qui, lui, n'était pas assez proche pour être fusionné
        // dans ce groupe-ci.
        const radius = Math.min(24 + cluster.pins.length * 4, 38);
        cluster.pins.forEach((pin, idx) => {
          const angle = (idx / cluster.pins.length) * Math.PI * 2 - Math.PI / 2;
          const targetScreen = { x: centerScreen.x + Math.cos(angle) * radius, y: centerScreen.y + Math.sin(angle) * radius };
          const targetLngLat = map.unproject([targetScreen.x, targetScreen.y]);

          spiderfyLegsRef.current.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: [[cluster.lng, cluster.lat], [targetLngLat.lng, targetLngLat.lat]] },
            properties: {},
          });

          const marker = new maplibregl.Marker({ element: buildPinElement(pin) })
            .setLngLat([targetLngLat.lng, targetLngLat.lat])
            .addTo(map);
          markersRef.current.push(marker);
        });

        // Petit point au centre pour replier le déploiement.
        const collapseEl = document.createElement('div');
        collapseEl.style.width = '14px';
        collapseEl.style.height = '14px';
        collapseEl.style.borderRadius = '50%';
        collapseEl.style.background = 'var(--accent-signal, #FF5A1F)';
        collapseEl.style.border = '2px solid #14161B';
        collapseEl.style.cursor = 'pointer';
        collapseEl.addEventListener('click', (e) => { e.stopPropagation(); setSpiderfiedClusterId(null); });
        const collapseMarker = new maplibregl.Marker({ element: collapseEl })
          .setLngLat([cluster.lng, cluster.lat])
          .addTo(map);
        markersRef.current.push(collapseMarker);
        continue;
      }

      // Groupe non déployé — un seul pin avec le nombre d'éléments regroupés.
      // La couleur et la forme reflètent la composition du groupe, pour
      // qu'on ne pense pas que ce sont tous des signalements citoyens
      // quand plusieurs couches officielles sont activées en même temps :
      // - uniquement des signalements (résolus ou non) → cercle orange
      // - uniquement des données officielles (feux, cabanes, travaux...) →
      //   carré arrondi bleu (couleur "officielle" déjà utilisée ailleurs)
      // - un mélange des deux → cercle violet, pour signaler clairement
      //   que ce n'est pas qu'une seule catégorie
      const hasCommunity = cluster.pins.some((p) => p.colorVar !== 'official');
      const hasOfficial = cluster.pins.some((p) => p.colorVar === 'official');
      const isMixed = hasCommunity && hasOfficial;

      const el = document.createElement('div');
      el.style.width = '36px';
      el.style.height = '36px';
      el.style.borderRadius = isMixed ? '50%' : hasOfficial && !hasCommunity ? '10px' : '50%';
      el.style.background = isMixed ? '#A56CFF' : hasOfficial && !hasCommunity ? 'var(--official-blue)' : 'var(--accent-signal, #FF5A1F)';
      el.style.border = '3px solid #14161B';
      el.style.boxShadow = '0 2px 8px rgba(0,0,0,0.5)';
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.fontFamily = 'var(--font-display, sans-serif)';
      el.style.fontWeight = '700';
      el.style.fontSize = '13px';
      el.style.color = '#14161B';
      el.style.cursor = 'pointer';
      el.textContent = String(cluster.pins.length);
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        // Déployer 16 pins en étoile à un niveau de zoom éloigné est
        // confus — mieux vaut se rapprocher d'abord, ce qui sépare
        // naturellement le regroupement en sous-groupes plus petits
        // (le regroupement se recalcule selon la distance à l'écran, pas
        // la distance géographique réelle). Seulement une fois assez
        // proche (regroupement de 2 ou moins) le déploiement en étoile
        // devient utile.
        if (cluster.pins.length > 2) {
          map.flyTo({ center: [cluster.lng, cluster.lat], zoom: map.getZoom() + 2, duration: 500 });
        } else {
          setSpiderfiedClusterId(cluster.id);
        }
      });

      const marker = new maplibregl.Marker({ element: el }).setLngLat([cluster.lng, cluster.lat]).addTo(map);
      markersRef.current.push(marker);
    }

    if (map.isStyleLoaded()) ensureSpiderfyLinesLayer();
  }, [pinsSignature, clusterVersion, spiderfiedClusterId]);

  // Applique le style "sélectionné" directement sur l'élément DOM
  // existant, SANS passer par la reconstruction complète ci-dessus —
  // c'était la vraie cause du besoin de cliquer deux fois pour
  // sélectionner un autre signalement : le tableau pins (qui inclut le
  // drapeau selected par pin) est recréé à chaque changement de
  // sélection dans le composant parent, ce qui déclenchait la
  // destruction/reconstruction de TOUS les marqueurs de la carte à
  // répétition, y compris celui qu'on venait tout juste de cliquer.
  useEffect(() => {
    pinElementsRef.current.forEach((el, id) => {
      el.style.boxShadow = id === selectedPinId
        ? '0 0 0 3px #FF2D3B, 0 0 0 6px rgba(255,45,59,0.35), 0 2px 6px rgba(0,0,0,0.4)'
        : '0 2px 6px rgba(0,0,0,0.4)';
    });
  }, [selectedPinId]);

  // Sélectionner un pin depuis l'extérieur (ex. clic dans la liste plutôt
  // que sur la carte) doit aussi révéler ce pin s'il est caché dans un
  // regroupement — même règle que le clic direct sur un regroupement :
  // zoomer d'abord si le groupe est gros (plus de 2), déployer en étoile
  // seulement s'il est déjà petit.
  //
  // IMPORTANT : ne réagit qu'à un NOUVEAU focusPinId (une nouvelle
  // sélection), jamais à clusterVersion — sinon, comme le zoom lui-même
  // incrémente clusterVersion, cet effet se redéclenchait à chaque fois
  // que l'usager essayait de DÉZOOMER manuellement avec un signalement
  // sélectionné, le ramenant de force dessus à répétition (« ne lâche
  // pas le morceau »). Une seule tentative de révélation à la sélection,
  // qui respecte ensuite tout dézoom manuel ultérieur.
  useEffect(() => {
    if (!mapRef.current || !focusPinId) return;
    const map = mapRef.current;
    let cancelled = false;

    // Cascade de zoom pour révéler le pin sélectionné, même caché dans un
    // gros regroupement — un seul +2 ne suffit pas toujours à dissoudre
    // un regroupement de plusieurs dizaines de pins en dessous de 3. On
    // enchaîne donc les étapes de zoom (chacune déclenchée seulement après
    // la fin de la précédente, via 'moveend') jusqu'à ce que le pin ne
    // soit plus dans un regroupement de plus de 2, avec un plafond de
    // sécurité pour ne jamais boucler indéfiniment.
    //
    // IMPORTANT : cette cascade est entièrement contenue dans cette seule
    // exécution de l'effet (déclenchée par un NOUVEAU focusPinId,
    // jamais par clusterVersion — voir la note historique plus bas) — une
    // fois terminée, elle ne se redéclenche jamais toute seule, donc elle
    // ne se bat pas contre un dézoom manuel ultérieur de l'usager.
    function reveal(attemptsLeft: number) {
      if (cancelled || !focusPinId) return;
      const clusters = clusterPins(pins, map);
      const owningCluster = clusters.find((c) => c.pins.length > 1 && c.pins.some((p) => p.id === focusPinId));

      if (!owningCluster) {
        // Plus dans aucun regroupement — soit déjà résolu, soit devenu un
        // pin seul en cours de route. Le centrer directement, au cas où.
        const pin = pins.find((p) => p.id === focusPinId);
        if (pin) map.flyTo({ center: [pin.longitude, pin.latitude], duration: 400 });
        return;
      }

      if (owningCluster.pins.length <= 2) {
        setSpiderfiedClusterId(owningCluster.id);
        return;
      }

      if (attemptsLeft <= 0) return;
      map.once('moveend', () => reveal(attemptsLeft - 1));
      map.flyTo({ center: [owningCluster.lng, owningCluster.lat], zoom: map.getZoom() + 2, duration: 500 });
    }

    reveal(6);
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPinId]);

  // Survol d'un élément dans la liste (hors carte) → montrer la bulle photo
  // du pin correspondant, réciproque du survol direct du pin sur la carte.
  const prevHoveredRef = useRef<string | null>(null);
  useEffect(() => {
    if (!mapRef.current) return;
    if (prevHoveredRef.current && prevHoveredRef.current !== hoveredPinId) {
      popupsByIdRef.current[prevHoveredRef.current]?.popup.remove();
    }
    if (hoveredPinId) {
      const entry = popupsByIdRef.current[hoveredPinId];
      entry?.popup.setLngLat([entry.lng, entry.lat]).addTo(mapRef.current);
    }
    prevHoveredRef.current = hoveredPinId;
  }, [hoveredPinId]);

  // Point "vous êtes ici" — marqueur dédié, distinct des pins de signalement
  useEffect(() => {
    if (!mapRef.current) return;
    userMarkerRef.current?.remove();
    userMarkerRef.current = null;

    if (userLocation) {
      const el = document.createElement('div');
      el.className = 'you-are-here-dot';
      el.innerHTML = '<div class="you-are-here-ring"></div><div class="you-are-here-core"></div>';
      userMarkerRef.current = new maplibregl.Marker({ element: el })
        .setLngLat([userLocation.lng, userLocation.lat])
        .addTo(mapRef.current);
    }
  }, [userLocation]);

  // Redessiner les lignes (segments de route) à chaque changement de liste
  useEffect(() => {
    linesClickMapRef.current = Object.fromEntries(
      lines.filter((l) => l.onClick).map((l) => [l.id, l.onClick as () => void]),
    );
    if (mapRef.current) {
      ensureLinesLayer();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines]);

  return (
    <div
      ref={containerRef}
      style={
        fullBleed
          ? { width: '100%', height: '100%' }
          : { width: '100%', height, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--panel-border)' }
      }
    />
  );
}
