import { useEffect, useState } from 'react';
import { api } from '../api';

interface Props {
  incidentId: string;
  onClose: () => void;
}

const FRIENDLY_LABELS: Record<string, string> = {
  nom_route: 'Route',
  numero_route: 'Numéro de route',
  municipalite: 'Municipalité',
  mrc: 'MRC',
  region: 'Région administrative',
  date_debut: 'Début',
  date_fin: 'Fin',
  nature_travaux: 'Nature des travaux',
  entrave: 'Entrave',
  restriction: 'Restriction',
  direction: 'Direction',
  chaussee: 'État de la chaussée',
  visibilite: 'Visibilité',
};

function humanizeKey(key: string) {
  return FRIENDLY_LABELS[key.toLowerCase()] ?? key.replace(/_/g, ' ');
}

export default function ExternalIncidentPanel({ incidentId, onClose }: Props) {
  const [incident, setIncident] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<any>(`/external-data/incidents/${incidentId}`)
      .then(setIncident)
      .catch((err) => setError(err instanceof Error ? err.message : 'Détail introuvable.'));
  }, [incidentId]);

  const rawEntries = incident?.raw_data
    ? Object.entries(incident.raw_data).filter(([, v]) => v !== null && v !== '' && v !== undefined)
    : [];

  const isTravaux = incident?.category === 'mtmd_travaux_routiers';

  return (
    <div className="detail-panel-float mobile-visible">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div className="detail-title" style={{ fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{isTravaux ? '🚧' : '❄️'}</span>
          <span>{isTravaux ? 'Travaux routiers' : 'Conditions routières'}</span>
        </div>
        <button className="detail-panel-close" onClick={onClose}>✕</button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!incident && !error && <div className="center-msg" style={{ padding: 20 }}>Chargement...</div>}

      {incident && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
            {incident.title ?? incident.sourceName}
          </div>
          {incident.description && (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
              {incident.description}
            </div>
          )}

          {rawEntries.length > 0 && (
            <>
              <div className="section-label" style={{ fontSize: 13, marginTop: 12 }}>Détails</div>
              {rawEntries.map(([key, value]) => (
                <div
                  key={key}
                  style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '7px 0', borderBottom: '1px solid var(--panel-border)', fontSize: 12 }}
                >
                  <span style={{ color: 'var(--text-muted)' }}>{humanizeKey(key)}</span>
                  <span style={{ textAlign: 'right' }}>{String(value)}</span>
                </div>
              ))}
            </>
          )}

          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.5 }}>
            Source : {incident.provider} · {incident.sourceName}
            {incident.licenseNote && <><br />{incident.licenseNote}</>}
          </div>
        </>
      )}
    </div>
  );
}
