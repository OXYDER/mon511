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
}

interface Props {
  center: { lat: number; lng: number } | null;
  pins: MapPin[];
  height?: number | string;
  fullBleed?: boolean;
  theme?: 'dark' | 'light';
  onViewportChange?: (center: { lat: number; lng: number }, radiusMeters: number) => void;
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

export default function MapView({ center, pins, height = 320, fullBleed = false, theme = 'dark', onViewportChange }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function styleUrlFor(t: 'dark' | 'light') {
    if (!MAPTILER_KEY) return 'https://demotiles.maplibre.org/style.json';
    const styleName = t === 'dark' ? 'streets-v2-dark' : 'streets-v2-light';
    return `https://api.maptiler.com/maps/${styleName}/style.json?key=${MAPTILER_KEY}`;
  }

  // Initialisation de la carte une seule fois
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    mapRef.current = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrlFor(theme),
      center: center ? [center.lng, center.lat] : [-71.8929, 45.4042],
      zoom: 12,
    });
    mapRef.current.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

    mapRef.current.on('moveend', () => {
      if (!mapRef.current || !onViewportChange) return;
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const c = mapRef.current!.getCenter();
        const bounds = mapRef.current!.getBounds();
        const centerPoint = { lat: c.lat, lng: c.lng };
        const radius = haversineDistance(centerPoint, { lat: bounds.getNorth(), lng: bounds.getEast() });
        onViewportChange(centerPoint, Math.max(radius, 500));
      }, 400);
    });

    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Changer le style de tuiles quand le thème change, sans recréer la carte
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setStyle(styleUrlFor(theme));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // Recentrer quand la position change
  useEffect(() => {
    if (mapRef.current && center) {
      mapRef.current.flyTo({ center: [center.lng, center.lat], zoom: 13, duration: 800 });
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
      el.style.clipPath = 'polygon(50% 0%, 100% 27%, 100% 73%, 50% 100%, 0% 73%, 0% 27%)';
      el.style.background = '#1B1E25';
      el.style.border = `2.5px solid ${PIN_COLORS[pin.colorVar]}`;
      el.style.display = 'flex';
      el.style.alignItems = 'center';
      el.style.justifyContent = 'center';
      el.style.fontSize = '14px';
      el.textContent = pin.icon;
      if (pin.onClick) el.addEventListener('click', pin.onClick);

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([pin.longitude, pin.latitude])
        .addTo(mapRef.current);
      markersRef.current.push(marker);
    }
  }, [pins]);

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
