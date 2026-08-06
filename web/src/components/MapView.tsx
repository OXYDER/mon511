import { useEffect, useRef } from 'react';
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

export default function MapView({ center, pins, lines = [], userLocation = null, height = 320, fullBleed = false, theme = 'dark', mapType = 'default', onViewportChange, onMapClick }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const userMarkerRef = useRef<Marker | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const linesClickMapRef = useRef<Record<string, () => void>>({});

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
  useEffect(() => {
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
  useEffect(() => {
    if (!mapRef.current) return;

    markersRef.current.forEach((m) => m.remove());
    markersRef.current = [];

    for (const pin of pins) {
      const el = document.createElement('div');
      el.style.width = '32px';
      el.style.height = '32px';
      el.style.cursor = pin.onClick ? 'pointer' : 'default';
      el.style.borderRadius = '50%';
      el.style.background = '#1B1E25';
      el.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
      el.style.border = `2.5px solid ${PIN_COLORS[pin.colorVar]}`;
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.fontSize = '14px';
      el.textContent = pin.icon;
      if (pin.onClick) el.addEventListener('click', pin.onClick);

      if (pin.photoUrl) {
        const popup = new maplibregl.Popup({ offset: 20, closeButton: false, closeOnClick: false, className: 'pin-thumb-popup' })
          .setHTML(`<img src="${pin.photoUrl}" alt="" style="width:72px;height:72px;object-fit:cover;border-radius:8px;display:block;" />`);
        el.addEventListener('mouseenter', () => popup.setLngLat([pin.longitude, pin.latitude]).addTo(mapRef.current!));
        el.addEventListener('mouseleave', () => popup.remove());
      }

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([pin.longitude, pin.latitude])
        .addTo(mapRef.current);
      markersRef.current.push(marker);
    }
  }, [pins]);

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
