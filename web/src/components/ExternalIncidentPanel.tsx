import { useEffect, useState } from 'react';
import { api } from '../api';

interface Props {
  incidentId: string;
  onClose: () => void;
}

function parseMtmdDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value.replace(/\//g, '-'));
  return isNaN(parsed.getTime()) ? null : parsed;
}

function formatDateTime(value: string | null | undefined): string {
  const d = parseMtmdDate(value);
  return d ? d.toLocaleString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
}

// Champs à afficher, dans l'ordre, avec un libellé humain et un formateur
// optionnel — plutôt que de tout déverser en vrac, on choisit ce qui compte
// vraiment pour chaque type de flux (noms de champs confirmés depuis un
// vrai échantillon de données du MTMD).
const TRAVAUX_FIELDS: [string, string, ((v: any) => string)?][] = [
  ['identificationDesTravaux', 'Nature des travaux'],
  ['localisation', 'Localisation'],
  ['routeAutoroute', 'Route / autoroute'],
  ['direction', 'Direction'],
  ['entrave', 'Entrave'],
  ['entraveType', "Type d'entrave"],
  ['debut', 'Début', formatDateTime],
  ['fin', 'Fin prévue', formatDateTime],
  ['miseAJour', 'Dernière mise à jour', formatDateTime],
  ['detoursEtItinerairesFacultatifs', 'Détours suggérés'],
];

const CONDITIONS_FIELDS: [string, string, ((v: any) => string)?][] = [
  ['NomRoute', 'Route'],
  ['NomRegion', 'Région administrative'],
  ['LocalisationDebutFR', 'Entre'],
  ['LocalisationFinFR', 'Et'],
  ['DescriptionEtatChausseeFR', 'État de la chaussée'],
  ['DescriptionVisibiliteFR', 'Visibilité'],
  ['IndicateurPresenceLamesNeige', 'Lames à neige sur place', (v) => (v === 'Y' ? 'Oui' : 'Non')],
  ['EnVigueurDepuis', 'En vigueur depuis', formatDateTime],
];

const AVERTISSEMENTS_FIELDS: [string, string, ((v: any) => string)?][] = [
  ['municipalite', 'Municipalité'],
  ['localisation', 'Localisation'],
  ['direction', 'Direction'],
  ['entrave', 'Entrave'],
  ['cause', 'Cause'],
  ['duree', 'Durée prévue'],
  ['detour', 'Détour'],
  ['consequence', 'Conséquence'],
  ['enVigueurDepuis', 'En vigueur depuis', formatDateTime],
];

const CIRCULATION_FIELDS: [string, string, ((v: any) => string)?][] = [
  ['des_debut_sous_route', 'De'],
  ['des_fin_sous_route', 'À'],
  ['annee_en_cours', "Données de l'année en cours"],
  ['val_djma_annee_1', 'Débit journalier moyen annuel (véh/jour)'],
];

export default function ExternalIncidentPanel({ incidentId, onClose }: Props) {
  const [incident, setIncident] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIncident(null);
    api
      .get<any>(`/external-data/incidents/${incidentId}`)
      .then(setIncident)
      .catch((err) => setError(err instanceof Error ? err.message : 'Détail introuvable.'));
  }, [incidentId]);

  const category = incident?.category as string | undefined;
  const isTravaux = category === 'mtmd_travaux_routiers';
  const isAvertissement = category === 'mtmd_avertissements';
  const isCirculation = category === 'mtmd_debit_circulation';
  const fieldDefs = isTravaux
    ? TRAVAUX_FIELDS
    : isAvertissement
      ? AVERTISSEMENTS_FIELDS
      : isCirculation
        ? CIRCULATION_FIELDS
        : CONDITIONS_FIELDS;

  const panelIcon = isTravaux ? '🚧' : isAvertissement ? '⚠️' : isCirculation ? '🚗' : '❄️';
  const panelTitle = isTravaux
    ? 'Travaux routiers'
    : isAvertissement
      ? 'Avertissement routier'
      : isCirculation
        ? 'Débit de circulation'
        : 'Conditions routières';

  const rows = incident
    ? fieldDefs
        .map(([key, label, formatter]) => {
          const raw = incident.raw_data?.[key];
          if (raw === null || raw === undefined || raw === '') return null;
          return { label, value: formatter ? formatter(raw) : String(raw) };
        })
        .filter(Boolean) as { label: string; value: string }[]
    : [];

  return (
    <div className="detail-panel-float mobile-visible">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
        <div className="detail-title" style={{ fontSize: 17, display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{panelIcon}</span>
          <span>{panelTitle}</span>
        </div>
        <button className="detail-panel-close" onClick={onClose}>✕</button>
      </div>

      {error && <div className="error-banner">{error}</div>}
      {!incident && !error && <div className="center-msg" style={{ padding: 20 }}>Chargement...</div>}

      {incident && (
        <>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 14 }}>
            {incident.title ?? incident.sourceName}
          </div>

          {rows.map((r) => (
            <div
              key={r.label}
              style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--panel-border)', fontSize: 12 }}
            >
              <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{r.label}</span>
              <span style={{ textAlign: 'right' }}>{r.value}</span>
            </div>
          ))}

          <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.5 }}>
            Source : {incident.provider} · {incident.sourceName}
            {incident.licenseNote && <><br />{incident.licenseNote}</>}
          </div>
        </>
      )}
    </div>
  );
}
