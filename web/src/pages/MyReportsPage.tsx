import { useEffect, useState } from 'react';
import { api } from '../api';
import { pickName, timeAgo, statusPillClass } from '../i18n';

interface Props {
  onClose: () => void;
  lang: 'fr' | 'en';
}

const STATUS_LABELS: Record<string, [string, string]> = {
  pending_moderation: ['En modération', 'Pending'],
  published_unresolved: ['Non résolu', 'Unresolved'],
  published_resolved: ['Résolu', 'Resolved'],
  rejected: ['Refusé', 'Rejected'],
  withdrawn: ['Retiré', 'Withdrawn'],
};

export default function MyReportsPage({ onClose, lang }: Props) {
  const [reports, setReports] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [description, setDescription] = useState('');
  const [addressText, setAddressText] = useState('');
  const [problemTypeId, setProblemTypeId] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [newPhotoFiles, setNewPhotoFiles] = useState<File[]>([]);
  const [newPhotoPreviews, setNewPhotoPreviews] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterTypeId, setFilterTypeId] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'municipality'>('date_desc');

  async function loadList() {
    const results = await api.get<any[]>('/users/me/reports');
    setReports(results);
  }

  async function loadDetail(id: string) {
    const d = await api.get<any>(`/reports/${id}/owner-detail`);
    setDetail(d);
    setDescription(d.description ?? '');
    setAddressText(d.addressText ?? '');
    setProblemTypeId(d.problemTypeId ?? '');
    setNewPhotoFiles([]);
    setNewPhotoPreviews([]);
  }

  useEffect(() => {
    loadList();
    api.get<any[]>('/problem-types').then(setTypes).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Clique sur une carte — l'ouvre juste en dessous d'elle-même (accordéon),
   * pas dans un cadre séparé. Recliquer sur la même carte la referme. */
  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    setFeedback(null);
    setError(null);
    loadDetail(id);
  }

  async function save() {
    if (!expandedId) return;
    setError(null);
    try {
      await api.patch(`/reports/${expandedId}`, { description, addressText, problemTypeId });
      if (newPhotoFiles.length > 0) {
        setUploading(true);
        for (const file of newPhotoFiles) {
          const formData = new FormData();
          formData.append('file', file);
          await api.post(`/reports/${expandedId}/photos`, formData).catch(() => {});
        }
        setUploading(false);
      }
      setFeedback(lang === 'fr' ? 'Signalement mis à jour.' : 'Report updated.');
      loadDetail(expandedId);
      loadList();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
      setUploading(false);
    }
  }

  /** Confirmation rapide directement depuis la bulle de la liste — pas
   * besoin d'ouvrir la carte pour confirmer une résolution suggérée. */
  async function quickConfirmResolved(id: string) {
    await api.post(`/reports/${id}/owner-confirm-resolved`, {}).catch(() => {});
    loadList();
    if (expandedId === id) loadDetail(id);
  }

  async function confirmResolved() {
    if (!expandedId) return;
    await api.post(`/reports/${expandedId}/owner-confirm-resolved`, {}).catch(() => {});
    loadDetail(expandedId);
    loadList();
  }

  async function withdraw() {
    if (!expandedId) return;
    if (!window.confirm(lang === 'fr' ? 'Retirer ce signalement ? Cette action est définitive.' : 'Withdraw this report? This cannot be undone.')) return;
    await api.delete(`/reports/${expandedId}`);
    setExpandedId(null);
    setDetail(null);
    loadList();
  }

  async function deletePhoto(photoId: string) {
    if (!expandedId) return;
    await api.delete(`/reports/${expandedId}/photos/${photoId}`);
    loadDetail(expandedId);
  }

  function handleAddPhotos(e: React.ChangeEvent<HTMLInputElement>) {
    const currentTotal = (detail?.photos?.length ?? 0) + newPhotoFiles.length;
    const room = Math.max(0, 3 - currentTotal);
    const selected = Array.from(e.target.files ?? []).slice(0, room);
    e.target.value = '';
    setNewPhotoFiles((prev) => [...prev, ...selected]);
    setNewPhotoPreviews((prev) => [...prev, ...selected.map((f) => URL.createObjectURL(f))]);
  }

  function removeNewPhoto(index: number) {
    setNewPhotoFiles((prev) => prev.filter((_, i) => i !== index));
    setNewPhotoPreviews((prev) => prev.filter((_, i) => i !== index));
  }

  const searchLower = search.trim().toLowerCase();
  const filteredReports = reports
    .filter((r) => filterStatus === 'all' || r.status === filterStatus)
    .filter((r) => filterTypeId === 'all' || r.problem_type_id === filterTypeId)
    .filter((r) => !searchLower || `${r.municipalityName ?? ''} ${r.addressText ?? ''}`.toLowerCase().includes(searchLower))
    .sort((a, b) => {
      if (sortBy === 'municipality') {
        return (a.municipalityName ?? '').localeCompare(b.municipalityName ?? '', 'fr-CA');
      }
      return sortBy === 'date_desc'
        ? new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        : new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

  const activeFlags = detail?.flags?.filter((f: any) => !f.handled_at) ?? [];
  const pendingSuggestions = detail?.resolutionSuggestions?.filter((s: any) => s.status === 'pending') ?? [];

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

      <div style={{ maxWidth: 720, margin: '0 auto', padding: '20px 24px 60px' }}>
        <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          {lang === 'fr' ? 'Mes signalements' : 'My reports'} ({filteredReports.length})
        </div>

        <div className="field-group" style={{ marginBottom: 10 }}>
          <input
            className="text-input"
            placeholder={lang === 'fr' ? 'Chercher par municipalité, ville, adresse...' : 'Search by municipality, city, address...'}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} style={{ flex: 1 }}>
            <option value="all">{lang === 'fr' ? 'Tous les statuts' : 'All statuses'}</option>
            {Object.entries(STATUS_LABELS).map(([key, [fr, en]]) => (
              <option key={key} value={key}>{lang === 'fr' ? fr : en}</option>
            ))}
          </select>
          <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} style={{ flex: 1 }}>
            <option value="date_desc">{lang === 'fr' ? 'Plus récent' : 'Newest'}</option>
            <option value="date_asc">{lang === 'fr' ? 'Plus ancien' : 'Oldest'}</option>
            <option value="municipality">{lang === 'fr' ? 'Municipalité (A-Z)' : 'Municipality (A-Z)'}</option>
          </select>
        </div>
        <select value={filterTypeId} onChange={(e) => setFilterTypeId(e.target.value)} style={{ width: '100%', marginBottom: 14 }}>
          <option value="all">{lang === 'fr' ? 'Tous les types' : 'All types'}</option>
          {types.map((t) => (
            <option key={t.id} value={t.id}>{t.icon} {pickName(t.name_fr, t.name_en, lang)}</option>
          ))}
        </select>

        {filteredReports.length === 0 && (
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            {lang === 'fr' ? 'Aucun signalement pour ces filtres.' : 'No reports match these filters.'}
          </div>
        )}

        {filteredReports.map((r) => {
          const isExpanded = expandedId === r.id;
          return (
            <div key={r.id} style={{ marginBottom: 8 }}>
              <div
                className="report-card"
                style={{ borderColor: isExpanded ? 'var(--accent-signal)' : undefined, cursor: 'pointer' }}
                onClick={() => toggleExpand(r.id)}
              >
                <div className={`rc-icon-hex ${r.status === 'published_resolved' ? 'resolved' : ''}`}>
                  {r.problemTypeIcon ?? '📍'}
                </div>
                <div className="rc-body">
                  <div className="rc-title">{pickName(r.problemTypeNameFr, r.problemTypeNameEn, lang)}</div>
                  <div className="rc-meta">{r.addressText ?? 'GPS'}</div>
                </div>
                <span className={`pill ${statusPillClass(r.status)}`}>
                  {lang === 'fr' ? STATUS_LABELS[r.status]?.[0] : STATUS_LABELS[r.status]?.[1]}
                </span>
                {r.pendingResolutionSuggestionsCount > 0 && (
                  <span
                    title={lang === 'fr' ? `${r.pendingResolutionSuggestionsCount} personne(s) suggèrent que c'est résolu — clique pour confirmer` : `${r.pendingResolutionSuggestionsCount} people suggest this is resolved — click to confirm`}
                    className="badge-dot"
                    style={{ position: 'static', background: 'var(--status-resolved)', cursor: 'pointer' }}
                    onClick={(e) => { e.stopPropagation(); quickConfirmResolved(r.id); }}
                  >
                    ✔{r.pendingResolutionSuggestionsCount}
                  </span>
                )}
                {r.pendingFlagsCount > 0 && (
                  <span
                    title={lang === 'fr' ? `${r.pendingFlagsCount} signalement(s) d'abus reçu(s)` : `${r.pendingFlagsCount} abuse report(s) received`}
                    className="badge-dot"
                    style={{ position: 'static', background: 'var(--status-danger, #FF4D5E)' }}
                  >
                    🚩{r.pendingFlagsCount}
                  </span>
                )}
                <span style={{ marginLeft: 8, color: 'var(--accent-signal)', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                  {isExpanded ? '−' : '+'}
                </span>
              </div>

              {/* Agrandissement — l'édition s'ouvre directement sous la
                  carte cliquée, pas dans un cadre séparé ailleurs. */}
              {isExpanded && (
                <div style={{ background: 'var(--panel)', border: '1px solid var(--accent-signal)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: 20, marginTop: -1 }}>
                  {!detail && <div className="center-msg">{lang === 'fr' ? 'Chargement...' : 'Loading...'}</div>}
                  {detail && (
                    <>
                      {feedback && <div className="success-banner">{feedback}</div>}
                      {error && <div className="error-banner">{error}</div>}

                      {activeFlags.length > 0 && (
                        <div className="error-banner">
                          🚩 {lang === 'fr'
                            ? `${activeFlags.length} signalement(s) d'abus reçu(s) — un modérateur va examiner. Motif : ${activeFlags[0].reason}`
                            : `${activeFlags.length} abuse report(s) received — a moderator will review. Reason: ${activeFlags[0].reason}`}
                        </div>
                      )}
                      {pendingSuggestions.length > 0 && (
                        <div className="success-banner" style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-start' }}>
                          <span>
                            ✔ {lang === 'fr'
                              ? `${pendingSuggestions.length} personne(s) ont suggéré que c'est résolu.`
                              : `${pendingSuggestions.length} people suggested this is resolved.`}
                          </span>
                          <button className="btn-primary" style={{ width: 'auto', fontSize: 12 }} onClick={confirmResolved}>
                            {lang === 'fr' ? '✔ Confirmer que c\'est résolu' : '✔ Confirm this is resolved'}
                          </button>
                        </div>
                      )}

                      <div className="detail-meta-row" style={{ marginBottom: 14 }}>
                        <span>👍 {detail.confirmationsCount} {lang === 'fr' ? 'confirmations' : 'confirmations'}</span>
                        <span>🕓 {lang === 'fr' ? 'Créé le' : 'Created'} {new Date(detail.created_at).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA')} <span style={{ color: 'var(--text-muted)' }}>({timeAgo(detail.created_at, lang)})</span></span>
                      </div>

                      {detail.photos?.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
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
                      {newPhotoPreviews.length > 0 && (
                        <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
                          {newPhotoPreviews.map((src, i) => (
                            <div key={src} style={{ position: 'relative', width: 90, height: 90 }}>
                              <img src={src} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 9, opacity: 0.7 }} />
                              <button
                                className="icon-btn"
                                onClick={() => removeNewPhoto(i)}
                                style={{ position: 'absolute', top: -6, right: -6, width: 22, height: 22, fontSize: 10 }}
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                      {(detail.photos?.length ?? 0) + newPhotoFiles.length < 3 && (
                        <label className="btn-ghost" style={{ display: 'inline-block', marginBottom: 16, cursor: 'pointer' }}>
                          📷 {lang === 'fr' ? 'Ajouter une photo' : 'Add a photo'}
                          <input type="file" accept="image/*" multiple onChange={handleAddPhotos} style={{ display: 'none' }} />
                        </label>
                      )}

                      <div className="field-group">
                        <label className="field-label">{lang === 'fr' ? 'Type de problème' : 'Problem type'}</label>
                        <select value={problemTypeId} onChange={(e) => setProblemTypeId(e.target.value)}>
                          {types.map((t) => (
                            <option key={t.id} value={t.id}>{t.icon} {pickName(t.name_fr, t.name_en, lang)}</option>
                          ))}
                        </select>
                      </div>
                      <div className="field-group">
                        <label className="field-label">{lang === 'fr' ? 'Description' : 'Description'}</label>
                        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
                      </div>
                      <div className="field-group">
                        <label className="field-label">{lang === 'fr' ? 'Adresse' : 'Address'}</label>
                        <input className="text-input" value={addressText} onChange={(e) => setAddressText(e.target.value)} />
                      </div>

                      <div className="action-row">
                        <button className="btn-primary" onClick={save} disabled={uploading}>
                          {uploading ? (lang === 'fr' ? 'Envoi...' : 'Uploading...') : (lang === 'fr' ? 'Enregistrer' : 'Save')}
                        </button>
                        <button className="btn-ghost btn-danger" onClick={withdraw}>
                          {lang === 'fr' ? 'Retirer ce signalement' : 'Withdraw report'}
                        </button>
                      </div>

                      {detail.statusHistory?.length > 0 && (
                        <>
                          <div className="section-label" style={{ fontSize: 13 }}>{lang === 'fr' ? 'Historique de statut' : 'Status history'}</div>
                          {detail.statusHistory.map((h: any, i: number) => (
                            <div key={i} className="comment">
                              <div className="comment-author">{new Date(h.changed_at).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}</div>
                              {(lang === 'fr' ? STATUS_LABELS[h.old_status]?.[0] : STATUS_LABELS[h.old_status]?.[1]) ?? '—'}
                              {' → '}
                              {lang === 'fr' ? STATUS_LABELS[h.new_status]?.[0] : STATUS_LABELS[h.new_status]?.[1]}
                              {h.reason && ` — ${h.reason}`}
                            </div>
                          ))}
                        </>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
