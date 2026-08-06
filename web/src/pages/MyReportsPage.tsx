import { useEffect, useState } from 'react';
import { api } from '../api';

interface Props {
  onClose: () => void;
  lang: 'fr' | 'en';
}

export default function MyReportsPage({ onClose, lang }: Props) {
  const [reports, setReports] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [description, setDescription] = useState('');
  const [addressText, setAddressText] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadList() {
    const results = await api.get<any[]>('/users/me/reports');
    setReports(results);
    if (!selectedId && results[0]) setSelectedId(results[0].id);
  }

  async function loadDetail(id: string) {
    const d = await api.get<any>(`/reports/${id}`);
    setDetail(d);
    setDescription(d.description ?? '');
    setAddressText(d.addressText ?? '');
  }

  useEffect(() => { loadList(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId]);

  async function save() {
    if (!selectedId) return;
    setError(null);
    try {
      await api.patch(`/reports/${selectedId}`, { description, addressText });
      setFeedback(lang === 'fr' ? 'Signalement mis à jour.' : 'Report updated.');
      loadDetail(selectedId);
      loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    }
  }

  async function withdraw() {
    if (!selectedId) return;
    if (!window.confirm(lang === 'fr' ? 'Retirer ce signalement ? Cette action est définitive.' : 'Withdraw this report? This cannot be undone.')) return;
    await api.delete(`/reports/${selectedId}`);
    setSelectedId(null);
    setDetail(null);
    loadList();
  }

  async function deletePhoto(photoId: string) {
    if (!selectedId) return;
    await api.delete(`/reports/${selectedId}/photos/${photoId}`);
    loadDetail(selectedId);
  }

  return (
    <div className="app-full" style={{ position: 'fixed', background: 'var(--bg-asphalt)', overflowY: 'auto' }}>
      <header className="topbar-float" style={{ position: 'sticky', background: 'var(--bg-asphalt)' }}>
        <div className="brand-row">
          <span className="brand-mark">511</span>
          <span className="brand-name">{lang === 'fr' ? 'Mes signalements' : 'My reports'}</span>
        </div>
        <button className="btn-ghost" onClick={onClose} style={{ pointerEvents: 'auto' }}>
          ← {lang === 'fr' ? 'Retour à la carte' : 'Back to map'}
        </button>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px 60px', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 280px', minWidth: 260 }}>
          <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
            {lang === 'fr' ? 'Mes signalements' : 'My reports'} ({reports.length})
          </div>
          {reports.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              {lang === 'fr' ? "Tu n'as encore fait aucun signalement." : "You haven't made any reports yet."}
            </div>
          )}
          {reports.map((r) => (
            <div
              key={r.id}
              className="report-card"
              style={{ borderColor: selectedId === r.id ? 'var(--accent-signal)' : undefined }}
              onClick={() => { setSelectedId(r.id); setFeedback(null); }}
            >
              <div className={`rc-icon-hex ${r.status === 'published_resolved' ? 'resolved' : ''}`}>
                {r.problemTypeIcon ?? '📍'}
              </div>
              <div className="rc-body">
                <div className="rc-title">{r.problemTypeNameFr}</div>
                <div className="rc-meta">{new Date(r.created_at).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA')}</div>
              </div>
              <span className={`pill ${r.status === 'published_resolved' ? 'resolved' : r.status === 'withdrawn' ? '' : 'unresolved'}`}>
                {r.status === 'published_resolved' ? (lang === 'fr' ? 'Résolu' : 'Resolved')
                  : r.status === 'pending_moderation' ? (lang === 'fr' ? 'En modération' : 'Pending')
                  : r.status === 'withdrawn' ? (lang === 'fr' ? 'Retiré' : 'Withdrawn')
                  : r.status === 'rejected' ? (lang === 'fr' ? 'Refusé' : 'Rejected')
                  : (lang === 'fr' ? 'Non résolu' : 'Unresolved')}
              </span>
            </div>
          ))}
        </div>

        <div style={{ flex: '2 1 380px', minWidth: 300, background: 'var(--panel)', border: '1px solid var(--panel-border)', borderRadius: 12, padding: 20 }}>
          {!detail && <div className="center-msg">{lang === 'fr' ? 'Sélectionne un signalement à gauche.' : 'Select a report on the left.'}</div>}
          {detail && (
            <>
              {feedback && <div className="success-banner">{feedback}</div>}
              {error && <div className="error-banner">{error}</div>}

              {detail.photos?.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
                  {detail.photos.map((p: any) => (
                    <div key={p.id} style={{ position: 'relative', width: 90, height: 90 }}>
                      <img src={p.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 9 }} />
                      <button
                        className="icon-btn"
                        onClick={() => deletePhoto(p.id)}
                        style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, fontSize: 10 }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="field-group">
                <label className="field-label">{lang === 'fr' ? 'Description' : 'Description'}</label>
                <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="field-group">
                <label className="field-label">{lang === 'fr' ? 'Adresse' : 'Address'}</label>
                <input className="text-input" value={addressText} onChange={(e) => setAddressText(e.target.value)} />
              </div>

              <div className="action-row">
                <button className="btn-primary" onClick={save}>{lang === 'fr' ? 'Enregistrer' : 'Save'}</button>
                <button className="btn-ghost btn-danger" onClick={withdraw}>
                  {lang === 'fr' ? 'Retirer ce signalement' : 'Withdraw report'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
