import { useEffect, useState } from 'react';
import { api } from '../api';
import MapView, { MapPin } from '../components/MapView';

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
  onOpenReport: (id: string) => void;
}

export default function MapPage({ onOpenReport }: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [externalIncidents, setExternalIncidents] = useState<ExternalIncident[]>([]);
  const [showOfficialLayer, setShowOfficialLayer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);

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

  const reportPins: MapPin[] = reports.map((r) => ({
    id: r.id,
    latitude: r.latitude,
    longitude: r.longitude,
    icon: r.problemTypeIcon ?? '📍',
    colorVar: r.status === 'published_resolved' ? 'resolved' : 'unresolved',
    onClick: () => onOpenReport(r.id),
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
    <div className="content" style={{ padding: '18px 0 90px' }}>
      <div style={{ padding: '0 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600 }}>Près de vous</span>
        <button className="btn-ghost" onClick={locateAndLoad} disabled={locating}>
          {locating ? '⏳' : '🎯'} Localiser
        </button>
      </div>

      <div style={{ padding: '0 20px' }}>
        <MapView center={center} pins={[...reportPins, ...officialPins]} />
      </div>

      <div style={{ padding: '0 20px' }}>
        <div className="layer-toggle" style={{ marginTop: 14 }}>
          <span>🏛️ Couche officielle MTMD</span>
          <button className="btn-ghost" onClick={toggleOfficialLayer}>
            {showOfficialLayer ? 'Activée' : 'Désactivée'}
          </button>
        </div>

        {error && <div className="error-banner">{error}</div>}
        {loading && <div className="center-msg">Chargement des signalements...</div>}
        {!loading && reports.length === 0 && (!showOfficialLayer || externalIncidents.length === 0) && !error && (
          <div className="center-msg">Aucun signalement à proximité pour l'instant.<br />Sois le premier à en ajouter un !</div>
        )}

        {showOfficialLayer &&
          externalIncidents.map((inc) => (
            <div key={inc.id} className="report-card" style={{ cursor: 'default' }}>
              <div className="rc-icon-hex official">🏛️</div>
              <div className="rc-body">
                <div className="rc-title">{inc.title ?? inc.sourceName}</div>
                <div className="rc-meta">Source officielle · {inc.provider}</div>
              </div>
              <span className="pill official">Officiel</span>
            </div>
          ))}

        {reports.map((r) => (
          <div key={r.id} className="report-card" onClick={() => onOpenReport(r.id)}>
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
    </div>
  );
}
