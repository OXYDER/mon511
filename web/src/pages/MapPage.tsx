import { useEffect, useState } from 'react';
import { api } from '../api';

interface Report {
  id: string;
  status: string;
  description: string | null;
  addressText: string | null;
  problemTypeNameFr: string;
  problemTypeIcon: string | null;
  createdAt: string;
}

interface Props {
  onOpenReport: (id: string) => void;
}

export default function MapPage({ onOpenReport }: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  async function loadNearby(lat: number, lng: number) {
    setLoading(true);
    setError(null);
    try {
      const results = await api.get<Report[]>(`/reports/nearby?lat=${lat}&lng=${lng}&radius=15000`);
      setReports(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les signalements.');
    } finally {
      setLoading(false);
    }
  }

  function locateAndLoad() {
    if (!navigator.geolocation) {
      // Repli sur Sherbrooke si la géolocalisation n'est pas disponible
      loadNearby(45.4042, -71.8929);
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        loadNearby(pos.coords.latitude, pos.coords.longitude);
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

  return (
    <div className="content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontSize: 16, fontWeight: 600 }}>Près de vous</span>
        <button className="btn-ghost" onClick={locateAndLoad} disabled={locating}>
          {locating ? '⏳' : '🎯'} Localiser
        </button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {loading && <div className="center-msg">Chargement des signalements...</div>}
      {!loading && reports.length === 0 && !error && (
        <div className="center-msg">Aucun signalement à proximité pour l'instant.</div>
      )}

      {reports.map((r) => (
        <div key={r.id} className="report-card" onClick={() => onOpenReport(r.id)}>
          <div className="rc-icon">{r.problemTypeIcon ?? '📍'}</div>
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
  );
}
