import { useEffect, useRef, useState } from 'react';
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
  center: { lat: number; lng: number; zoom?: number } | null;
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

export default function MapView({ center, pins, lines = [], userLocation = null, height = 320, fullBleed = false, theme = 'dark', mapType = 'default', onViewportChange, onMapClick, focusPinId = null, hoveredPinId = null }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
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
    });
    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    mapRef.current.on('style.load', ensureLinesLayer);
    mapRef.current.on('style.load', ensureSpiderfyLinesLayer);
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
    });

    // Les distances en pixels entre pins changent avec le zoom — il faut
    // recalculer les groupes. Le déplacement (pan) seul ne change pas ces
    // distances relatives, donc pas besoin de recalculer pour ça.
    mapRef.current.on('zoomend', () => setClusterVersion((v) => v + 1));

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
      mapRef.current.flyTo({ center: [center.lng, center.lat], zoom: center.zoom ?? 13, duration: 800 });
    }
  }, [center]);

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

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];
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
        const radius = 42 + cluster.pins.length * 6;
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
        collapseEl.addEventListener('click', () => setSpiderfiedClusterId(null));
        const collapseMarker = new maplibregl.Marker({ element: collapseEl })
          .setLngLat([cluster.lng, cluster.lat])
          .addTo(map);
        markersRef.current.push(collapseMarker);
        continue;
      }

      // Groupe non déployé — un seul pin avec le nombre d'éléments regroupés.
      const el = document.createElement('div');
      el.style.width = '36px';
      el.style.height = '36px';
      el.style.borderRadius = '50%';
      el.style.background = 'var(--accent-signal, #FF5A1F)';
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
      el.addEventListener('click', () => setSpiderfiedClusterId(cluster.id));

      const marker = new maplibregl.Marker({ element: el }).setLngLat([cluster.lng, cluster.lat]).addTo(map);
      markersRef.current.push(marker);
    }

    if (map.isStyleLoaded()) ensureSpiderfyLinesLayer();
  }, [pins, clusterVersion, spiderfiedClusterId]);

  // Sélectionner un pin depuis l'extérieur (ex. clic dans la liste plutôt
  // que sur la carte) doit aussi déployer le groupe en éventail si ce pin
  // en fait partie — sinon il reste invisible, caché dans un groupe fermé.
  useEffect(() => {
    if (!mapRef.current || !focusPinId) return;
    const clusters = clusterPins(pins, mapRef.current);
    const owningCluster = clusters.find((c) => c.pins.length > 1 && c.pins.some((p) => p.id === focusPinId));
    if (owningCluster) setSpiderfiedClusterId(owningCluster.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusPinId, clusterVersion, pins]);

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
    if (mapRef.current && mapRef.current.isStyleLoaded()) {
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
