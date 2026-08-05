import { useEffect, useState } from 'react';
import { api } from '../api';

interface ProblemType {
  id: string;
  nameFr: string;
  icon: string | null;
}

interface Props {
  onClose: () => void;
  onCreated: () => void;
}

export default function CreateReportModal({ onClose, onCreated }: Props) {
  const [types, setTypes] = useState<ProblemType[]>([]);
  const [typeId, setTypeId] = useState<string>('');
  const [description, setDescription] = useState('');
  const [addressText, setAddressText] = useState('');
  const [coords, setCoords] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  const [municipalityNotified, setMunicipalityNotified] = useState<'yes' | 'no' | 'unknown'>('unknown');
  const [municipalityName, setMunicipalityName] = useState('');
  const [locating, setLocating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<any[]>('/problem-types').then((data) => {
      setTypes(data.map((t) => ({ id: t.id, nameFr: t.name_fr, icon: t.icon })));
      if (data[0]) setTypeId(data[0].id);
    });
  }, []);

  function locate() {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy });
        setLocating(false);
      },
      () => setLocating(false),
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!coords) {
      setError("Utilise le bouton de localisation avant d'envoyer le signalement.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/reports', {
        problemTypeId: typeId,
        latitude: coords.lat,
        longitude: coords.lng,
        gpsAccuracyM: coords.accuracy,
        addressText: addressText || undefined,
        description: description || undefined,
        municipalityNotified,
        municipalityName: municipalityNotified === 'yes' ? municipalityName || undefined : undefined,
      });
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Impossible d'envoyer le signalement.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box">
        <div className="modal-head">
          <div className="modal-title">Nouveau signalement</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {error && <div className="error-banner">{error}</div>}

          <form onSubmit={submit}>
            <div className="field-group">
              <label className="field-label">Type de problème</label>
              <div className="type-grid" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                {types.map((t) => (
                  <div
                    key={t.id}
                    className={`type-option ${typeId === t.id ? 'active' : ''}`}
                    onClick={() => setTypeId(t.id)}
                  >
                    <span className="ti">{t.icon ?? '📍'}</span>
                    <span>{t.nameFr}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="field-group">
              <label className="field-label">Localisation</label>
              <div className="geo-btn-row">
                <input className="text-input" placeholder="Adresse ou repère" value={addressText} onChange={(e) => setAddressText(e.target.value)} />
                <button
                  type="button"
                  className="btn-ghost"
                  onClick={locate}
                  disabled={locating}
                  style={{ flexShrink: 0, width: 44 }}
                  title="Utiliser ma position actuelle"
                >
                  {locating ? '⏳' : '🎯'}
                </button>
              </div>
              {coords && (
                <div className="geo-status ok">
                  Position précise capturée — précision ±{Math.round(coords.accuracy)} m
                </div>
              )}
            </div>

            <div className="field-group">
              <label className="field-label">Description</label>
              <textarea rows={3} placeholder="Décrivez le problème observé..." value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="field-group">
              <label className="field-label">La municipalité a-t-elle été avisée ?</label>
              <select value={municipalityNotified} onChange={(e) => setMunicipalityNotified(e.target.value as any)}>
                <option value="unknown">Je ne sais pas</option>
                <option value="yes">Oui</option>
                <option value="no">Non</option>
              </select>
              {municipalityNotified === 'yes' && (
                <input
                  className="text-input"
                  style={{ marginTop: 8 }}
                  placeholder="Ex. Ville de Sherbrooke"
                  value={municipalityName}
                  onChange={(e) => setMunicipalityName(e.target.value)}
                />
              )}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, lineHeight: 1.5 }}>
                Aide à prioriser les cas déjà signalés aux autorités.
              </div>
            </div>

            <button className="btn-primary" type="submit" disabled={submitting}>
              {submitting ? 'Envoi...' : 'Envoyer le signalement'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
