import { useEffect, useState } from 'react';
import { api } from '../api';
import { statusPillClass } from '../i18n';
import ToggleSwitch from '../components/ToggleSwitch';

interface Props {
  onClose: () => void;
}

type Tab = 'queue' | 'types' | 'external' | 'users' | 'municipalities' | 'allReports' | 'emailTemplates' | 'support' | 'municipalPortal' | 'settings';

export default function AdminPage({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('queue');

  return (
    <div className="app-full" style={{ position: 'fixed', background: 'var(--bg-asphalt)', overflowY: 'auto' }}>
      <header className="topbar-float" style={{ position: 'sticky', background: 'var(--bg-asphalt)' }}>
        <div className="brand-row">
          <span className="brand-mark">511</span>
          <span className="brand-name">Administration</span>
        </div>
        <button className="btn-ghost" onClick={onClose} style={{ pointerEvents: 'auto' }}>← Retour à la carte</button>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px 60px' }}>
        <div className="tabs" style={{ maxWidth: 620, marginBottom: 24, flexWrap: 'wrap' }}>
          <button className={`tab-item ${tab === 'queue' ? 'active' : ''}`} onClick={() => setTab('queue')}>
            File de modération
          </button>
          <button className={`tab-item ${tab === 'types' ? 'active' : ''}`} onClick={() => setTab('types')}>
            Catégories &amp; types
          </button>
          <button className={`tab-item ${tab === 'external' ? 'active' : ''}`} onClick={() => setTab('external')}>
            Données officielles
          </button>
          <button className={`tab-item ${tab === 'users' ? 'active' : ''}`} onClick={() => setTab('users')}>
            Utilisateurs
          </button>
          <button className={`tab-item ${tab === 'municipalities' ? 'active' : ''}`} onClick={() => setTab('municipalities')}>
            Municipalités
          </button>
          <button className={`tab-item ${tab === 'allReports' ? 'active' : ''}`} onClick={() => setTab('allReports')}>
            Tous les signalements
          </button>
          <button className={`tab-item ${tab === 'emailTemplates' ? 'active' : ''}`} onClick={() => setTab('emailTemplates')}>
            Courriels
          </button>
          <button className={`tab-item ${tab === 'support' ? 'active' : ''}`} onClick={() => setTab('support')}>
            Support
          </button>
          <button className={`tab-item ${tab === 'municipalPortal' ? 'active' : ''}`} onClick={() => setTab('municipalPortal')}>
            Portail municipal
          </button>
          <button className={`tab-item ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
            Paramètres
          </button>
        </div>

        {tab === 'queue' && <ModerationQueue />}
        {tab === 'types' && <ProblemTypesAdmin />}
        {tab === 'external' && <ExternalDataAdmin />}
        {tab === 'users' && <UsersAdmin />}
        {tab === 'municipalities' && <MunicipalitiesAdmin />}
        {tab === 'allReports' && <AllReportsAdmin />}
        {tab === 'emailTemplates' && <EmailTemplatesAdmin />}
        {tab === 'support' && <SupportTicketsAdmin />}
        {tab === 'municipalPortal' && <MunicipalPortalAdmin />}
        {tab === 'settings' && <SiteSettingsAdmin />}
      </div>
    </div>
  );
}

function ModerationQueue() {
  const [queue, setQueue] = useState<any[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [reply, setReply] = useState('');
  const [editingMunicipality, setEditingMunicipality] = useState(false);
  const [municipalitySearch, setMunicipalitySearch] = useState('');
  const [municipalityResults, setMunicipalityResults] = useState<any[]>([]);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [decidedFeedback, setDecidedFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const sortedQueue = [...queue].sort((a, b) => {
    const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return sortDir === 'asc' ? diff : -diff;
  });

  async function loadQueue() {
    try {
      const results = await api.get<any[]>('/moderation/queue');
      setQueue(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la file — accès réservé aux modérateurs.');
    }
  }

  async function loadDetail(id: string) {
    try {
      const d = await api.get<any>(`/moderation/${id}`);
      setDetail(d);
      setDecidedFeedback(null);
      setEditingMunicipality(false);
      setMunicipalitySearch('');
      setMunicipalityResults([]);
    } catch {
      setDetail(null);
    }
  }

  /** Clique sur une carte de la file — l'ouvre juste en dessous d'elle-même
   * (accordéon), pas dans un cadre séparé. Recliquer referme. */
  function toggleExpand(id: string) {
    if (expandedId === id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(id);
    loadDetail(id);
  }

  async function searchMunicipalities(q: string) {
    setMunicipalitySearch(q);
    if (q.trim().length < 2) { setMunicipalityResults([]); return; }
    try {
      const data = await api.get<{ results: any[] }>(`/municipality-integrations?search=${encodeURIComponent(q)}&limit=8`);
      setMunicipalityResults(data.results);
    } catch {
      setMunicipalityResults([]);
    }
  }

  async function applyMunicipality(regionId: string, name: string) {
    if (!expandedId) return;
    await api.patch(`/moderation/${expandedId}/region`, { regionId });
    setEditingMunicipality(false);
    setMunicipalitySearch('');
    setMunicipalityResults([]);
    setDetail((prev: any) => ({ ...prev, report: { ...prev.report, regionNameFr: name } }));
  }

  useEffect(() => { loadQueue(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(decision: 'approve' | 'reject') {
    if (!expandedId) return;
    if (decision === 'reject' && !reason.trim()) {
      setError('Un motif est obligatoire pour refuser un signalement.');
      return;
    }
    try {
      await api.patch(`/moderation/${expandedId}/decision`, { decision, reason: reason || undefined });
      // La confirmation reste attachée à CE signalement — on ne referme pas
      // le tiroir ni ne saute au suivant automatiquement (ça faisait
      // apparaître le message sur le mauvais signalement). La liste se met
      // à jour en arrière-plan (le signalement traité en disparaît) ; le
      // modérateur ouvre lui-même le prochain quand il est prêt.
      setDecidedFeedback(decision === 'approve' ? 'Signalement approuvé.' : 'Signalement refusé.');
      setReason('');
      loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    }
  }

  async function sendReply() {
    if (!expandedId || !reply.trim()) return;
    try {
      await api.post(`/moderation/${expandedId}/reply`, { message: reply });
      setReply('');
      loadDetail(expandedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible.');
    }
  }

  if (error) return <div className="error-banner">{error}</div>;

  return (
    <div>
      <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        En attente d'approbation ({queue.length})
      </div>
      <button
        className="btn-ghost"
        style={{ marginBottom: 12, fontSize: 11.5 }}
        onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
      >
        {sortDir === 'asc' ? '↓ Ascendant (plus ancien d\'abord)' : '↑ Descendant (plus récent d\'abord)'}
      </button>
      {queue.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Aucun signalement en attente.</div>}
      {feedback && <div className="success-banner">{feedback}</div>}

      {sortedQueue.map((r) => {
        const isExpanded = expandedId === r.id;
        return (
          <div key={r.id} style={{ marginBottom: 8 }}>
            <div
              className="report-card"
              style={{ borderColor: isExpanded ? 'var(--accent-signal)' : undefined, cursor: 'pointer' }}
              onClick={() => toggleExpand(r.id)}
            >
              {r.thumbnailUrl ? (
                <div className="rc-thumb-wrap">
                  <img src={r.thumbnailUrl} alt="" className="rc-icon-hex rc-thumb" />
                  <span className="rc-type-badge">{r.problemTypeIcon ?? '📍'}</span>
                </div>
              ) : (
                <div className="rc-icon-hex">{r.problemTypeIcon ?? '📍'}</div>
              )}
              <div className="rc-body">
                <div className="rc-title">{r.problemTypeNameFr}</div>
                <div className="rc-meta">{r.address_text ?? 'Position GPS'}</div>
              </div>
              <span style={{ color: 'var(--accent-signal)', fontWeight: 700, fontSize: 16, flexShrink: 0 }}>
                {isExpanded ? '−' : '+'}
              </span>
            </div>

            {/* Agrandissement — le détail et la décision s'ouvrent
                directement sous la carte cliquée. */}
            {isExpanded && (
              <div style={{ background: 'var(--panel)', border: '1px solid var(--accent-signal)', borderTop: 'none', borderRadius: '0 0 12px 12px', padding: 20, marginTop: -1 }}>
                {!detail && <div className="center-msg">Chargement...</div>}
                {detail && (
                  <>
                    {decidedFeedback && (
                      <div className="success-banner" style={{ fontSize: 14, fontWeight: 600 }}>
                        ✓ {decidedFeedback}
                      </div>
                    )}
                    <div className="detail-title" style={{ fontSize: 17 }}>{detail.report.description || 'Signalement'}</div>
                    <div className="detail-meta-row" style={{ margin: '8px 0 16px' }}>
                      <span>📍 {detail.report.address_text ?? 'Position GPS'}</span>
                      <span>🏛️ Municipalité avisée : {detail.report.municipality_notified}</span>
                    </div>

                    {detail.authenticity && (
                      <div style={{
                        marginBottom: 16, padding: 12, borderRadius: 10,
                        background: !detail.authenticity.verifiable ? 'var(--panel-hover)'
                          : detail.authenticity.confidencePercent >= 70 ? 'rgba(47,191,113,0.12)'
                          : detail.authenticity.confidencePercent >= 40 ? 'rgba(245,179,1,0.12)'
                          : 'rgba(255,45,59,0.12)',
                        border: `1px solid ${!detail.authenticity.verifiable ? 'var(--panel-border)'
                          : detail.authenticity.confidencePercent >= 70 ? 'var(--status-resolved)'
                          : detail.authenticity.confidencePercent >= 40 ? 'var(--status-unresolved)'
                          : '#FF2D3B'}`,
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                          <span style={{ fontSize: 16 }}>{!detail.authenticity.verifiable ? '❔' : detail.authenticity.confidencePercent >= 70 ? '✅' : detail.authenticity.confidencePercent >= 40 ? '⚠️' : '🚩'}</span>
                          <span style={{ fontSize: 13, fontWeight: 600 }}>
                            {!detail.authenticity.verifiable
                              ? 'Vérification photo : non vérifiable'
                              : `Vérification photo : ${detail.authenticity.confidencePercent}% de confiance`}
                          </span>
                        </div>
                        {detail.authenticity.details.map((d: string, i: number) => (
                          <div key={i} style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 3, lineHeight: 1.5 }}>• {d}</div>
                        ))}
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>
                          Aide à la décision, pas un verdict — le jugement final reste humain.
                        </div>
                      </div>
                    )}

                    {detail.photos?.length > 0 && (
                      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
                        {detail.photos.map((p: any) => (
                          <div key={p.id} style={{ width: 130 }}>
                            <img src={p.url} alt="" style={{ width: '100%', height: 100, objectFit: 'cover', borderRadius: 8, marginBottom: 6 }} />
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', lineHeight: 1.6 }}>
                              {p.exif_latitude ? (
                                <div>📍 {p.exif_latitude.toFixed(5)}, {p.exif_longitude.toFixed(5)}</div>
                              ) : (
                                <div>📍 Aucune position GPS</div>
                              )}
                              <div>🕓 {p.exif_captured_at ? new Date(p.exif_captured_at).toLocaleString('fr-CA') : 'Date inconnue'}</div>
                              {(p.exif_camera_make || p.exif_camera_model) && (
                                <div>📷 {[p.exif_camera_make, p.exif_camera_model].filter(Boolean).join(' ')}</div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, padding: '8px 12px', background: 'var(--panel-hover)', borderRadius: 9 }}>
                      <span style={{ fontSize: 12 }}>
                        🏛️ Municipalité détectée : <strong>{detail.report.regionNameFr ?? 'Aucune — à sélectionner manuellement'}</strong>
                      </span>
                      <button className="btn-ghost" style={{ marginLeft: 'auto', fontSize: 11 }} onClick={() => setEditingMunicipality((v: boolean) => !v)}>
                        {editingMunicipality ? 'Fermer' : 'Corriger'}
                      </button>
                    </div>
                    {editingMunicipality && (
                      <div style={{ marginBottom: 14, position: 'relative' }}>
                        <input
                          className="text-input"
                          placeholder="Rechercher une municipalité..."
                          value={municipalitySearch}
                          onChange={(e) => searchMunicipalities(e.target.value)}
                        />
                        {municipalityResults.length > 0 && (
                          <div className="search-dropdown" style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10 }}>
                            {municipalityResults.map((m: any) => (
                              <div key={m.region_id} className="search-dropdown-item" onClick={() => applyMunicipality(m.region_id, m.regionNameFr)}>
                                <span>🏛️</span><span>{m.regionNameFr}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {detail.flags?.length > 0 && (
                      <div className="error-banner">
                        {detail.flags.length} signalement(s) d'abus — motif : {detail.flags[0].reason}
                      </div>
                    )}

                    <div className="section-label" style={{ fontSize: 13 }}>Échange avec l'usager</div>
                    {detail.messages.map((m: any) => (
                      <div key={m.id} className="comment">
                        <div className="comment-author">{m.author_role === 'moderator' ? 'Modération' : m.authorEmail?.split('@')[0]}</div>
                        {m.message}
                      </div>
                    ))}
                    <div className="comment-row">
                      <input className="text-input" placeholder="Répondre à l'usager..." value={reply} onChange={(e) => setReply(e.target.value)} />
                      <button className="btn-ghost" onClick={sendReply}>Envoyer</button>
                    </div>

                    {!decidedFeedback && (
                      <>
                        <div className="section-label" style={{ fontSize: 13 }}>Décision</div>
                        <div className="field-group">
                          <label className="field-label">Motif (obligatoire pour un refus)</label>
                          <textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
                        </div>
                        <div className="action-row">
                          <button className="btn-primary" style={{ background: 'var(--status-resolved)' }} onClick={() => decide('approve')}>
                            ✔ Approuver
                          </button>
                          <button className="btn-ghost btn-danger" onClick={() => decide('reject')}>✕ Refuser</button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      <FlaggedReportsAdmin />
      <ResolutionSuggestionsAdmin />
    </div>
  );
}

function FlaggedReportsAdmin() {
  const [flagged, setFlagged] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setFlagged(await api.get<any[]>('/moderation/flags'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les signalements d\'abus.');
    }
  }

  useEffect(() => { load(); }, []);

  async function dismiss(reportId: string) {
    await api.patch(`/moderation/flags/${reportId}/dismiss`, {});
    load();
  }

  async function remove(reportId: string) {
    const reason = window.prompt('Motif du retrait :', 'Contenu inapproprié signalé par la communauté');
    if (!reason) return;
    await api.patch(`/moderation/flags/${reportId}/remove`, { reason });
    load();
  }

  if (error) return <div className="error-banner" style={{ marginBottom: 24 }}>{error}</div>;
  if (flagged.length === 0) return null;

  return (
    <div style={{ marginBottom: 28 }}>
      <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        🚩 Signalements d'abus à traiter ({flagged.length})
      </div>
      {flagged.map((r) => (
        <div key={r.id} className="report-card" style={{ cursor: 'default' }}>
          <div className="rc-icon-hex">{r.problemTypeIcon ?? '📍'}</div>
          <div className="rc-body">
            <div className="rc-title">{r.problemTypeNameFr} — {r.address_text ?? 'Position GPS'}</div>
            <div className="rc-meta">{r.flagCount} signalement(s) · motifs : {r.reasons.join(', ')}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-ghost" onClick={() => dismiss(r.id)}>Ignorer</button>
            <button className="btn-ghost btn-danger" onClick={() => remove(r.id)}>Retirer</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ResolutionSuggestionsAdmin() {
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      setSuggestions(await api.get<any[]>('/moderation/resolution-suggestions'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger les suggestions.');
    }
  }

  useEffect(() => { load(); }, []);

  async function accept(reportId: string) {
    await api.patch(`/moderation/resolution-suggestions/${reportId}/accept`, {});
    load();
  }

  async function dismiss(reportId: string) {
    await api.patch(`/moderation/resolution-suggestions/${reportId}/dismiss`, {});
    load();
  }

  if (error) return <div className="error-banner">{error}</div>;
  if (suggestions.length === 0) return null;

  return (
    <div>
      <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        ✔ Suggestions "résolu" à confirmer ({suggestions.length})
      </div>
      {suggestions.map((r) => (
        <div key={r.id} className="report-card" style={{ cursor: 'default' }}>
          <div className="rc-icon-hex">{r.problemTypeIcon ?? '📍'}</div>
          <div className="rc-body">
            <div className="rc-title">{r.problemTypeNameFr} — {r.address_text ?? 'Position GPS'}</div>
            <div className="rc-meta">{r.suggestionCount} suggestion(s) · poids total {r.totalWeight}</div>
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn-ghost" style={{ color: 'var(--status-resolved)' }} onClick={() => accept(r.id)}>Confirmer</button>
            <button className="btn-ghost" onClick={() => dismiss(r.id)}>Rejeter</button>
          </div>
        </div>
      ))}
    </div>
  );
}

function ExternalDataAdmin() {
  const [sources, setSources] = useState<any[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const LABELS: Record<string, string> = {
    mtmd_travaux_routiers: 'Travaux routiers',
    mtmd_conditions_hivernales: 'Conditions routières hivernales',
  };

  async function load() {
    try {
      const results = await api.get<any[]>('/external-data/sources');
      setSources(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accès réservé à l'administration.");
    }
  }

  useEffect(() => { load(); }, []);

  async function sync(feedKey: string) {
    setSyncing(feedKey);
    try {
      const result = await api.post<{ synced: boolean; count?: number; reason?: string }>(
        `/external-data/sources/${feedKey}/sync`,
      );
      setResults((prev) => ({
        ...prev,
        [feedKey]: result.synced ? `✔ ${result.count} incidents synchronisés à l'instant` : `✕ ${result.reason}`,
      }));
      load();
    } catch (err) {
      setResults((prev) => ({ ...prev, [feedKey]: err instanceof Error ? err.message : 'Échec' }));
    } finally {
      setSyncing(null);
    }
  }

  if (error) return <div className="error-banner">{error}</div>;

  return (
    <div>
      <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        Sources externes (MTMD)
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
        Synchronisation manuelle pour l'instant — pas encore de cron automatique.
        Voir le README pour la migration vers un vrai job planifié.
      </p>
      {sources.map((s) => (
        <div key={s.id} className="report-card" style={{ cursor: 'default' }}>
          <div className="rc-icon-hex official">🏛️</div>
          <div className="rc-body">
            <div className="rc-title">{LABELS[s.feed_key] ?? s.name}</div>
            <div className="rc-meta">
              {results[s.feed_key] ??
                (s.last_synced_at
                  ? `Dernière synchro : ${new Date(s.last_synced_at).toLocaleString('fr-CA')} · ${s.last_sync_status === 'ok' ? '✔ ok' : '✕ erreur'}`
                  : 'Jamais synchronisé')}
            </div>
          </div>
          <button className="btn-ghost" onClick={() => sync(s.feed_key)} disabled={syncing === s.feed_key}>
            {syncing === s.feed_key ? 'Synchronisation...' : 'Synchroniser'}
          </button>
        </div>
      ))}
    </div>
  );
}

function ProblemTypesAdmin() {
  const [types, setTypes] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const results = await api.get<any[]>('/problem-types/admin');
      setTypes(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accès réservé à l'administration.");
    }
  }

  useEffect(() => { load(); }, []);

  async function toggleActive(id: string, current: boolean) {
    await api.patch(`/problem-types/${id}`, { active: !current });
    load();
  }

  if (error) return <div className="error-banner">{error}</div>;

  return (
    <div>
      <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        Types de problèmes ({types.length})
      </div>
      {types.map((t) => (
        <div key={t.id} className="report-card" style={{ cursor: 'default' }}>
          <div className="rc-icon-hex">{t.icon ?? '📍'}</div>
          <div className="rc-body">
            <div className="rc-title">{t.name_fr}</div>
            <div className="rc-meta">{t.categoryNameFr}</div>
          </div>
          <ToggleSwitch on={t.active} onToggle={() => toggleActive(t.id, t.active)} title={t.active ? 'Actif' : 'Inactif'} />
        </div>
      ))}
    </div>
  );
}

function UsersAdmin() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const sortedUsers = [...users].sort((a, b) => {
    const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    return sortDir === 'asc' ? diff : -diff;
  });

  async function load() {
    try {
      const results = await api.get<any[]>(`/users/admin/all${search ? `?search=${encodeURIComponent(search)}` : ''}`);
      setUsers(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accès réservé à l'administration.");
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleSuspend(id: string, current: string) {
    const next = current === 'suspended' ? 'active' : 'suspended';
    await api.patch(`/users/admin/${id}/status`, { status: next });
    load();
  }

  async function changeRole(id: string, role: string) {
    await api.patch(`/users/admin/${id}/role`, { role });
    load();
  }

  if (error) return <div className="error-banner">{error}</div>;

  return (
    <div>
      <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        Utilisateurs ({users.length})
      </div>
      <div className="field-group" style={{ maxWidth: 320 }}>
        <input
          className="text-input"
          placeholder="Rechercher par courriel..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
      </div>
      <button
        className="btn-ghost"
        style={{ marginBottom: 14, fontSize: 11.5 }}
        onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
      >
        {sortDir === 'asc' ? '↓ Ascendant (plus ancien d\'abord)' : '↑ Descendant (plus récent d\'abord)'}
      </button>
      {sortedUsers.map((u) => (
        <div key={u.id} className="report-card" style={{ cursor: 'default' }}>
          <div className="rc-icon-hex">{(u.first_name?.[0] ?? u.email[0]).toUpperCase()}</div>
          <div className="rc-body">
            <div className="rc-title">{u.email}</div>
            <div className="rc-meta">réputation {u.reputation_score}</div>
          </div>
          <select value={u.roleName} onChange={(e) => changeRole(u.id, e.target.value)} style={{ width: 140, marginRight: 10 }}>
            <option value="user">user</option>
            <option value="moderator">moderator</option>
            <option value="admin">admin</option>
            <option value="super_admin">super_admin</option>
          </select>
          <ToggleSwitch
            on={u.status !== 'suspended'}
            onToggle={() => toggleSuspend(u.id, u.status)}
            title={u.status === 'suspended' ? 'Suspendu — cliquer pour réactiver' : 'Actif — cliquer pour suspendre'}
          />
        </div>
      ))}
    </div>
  );
}

function SiteSettingsAdmin() {
  const [settings, setSettings] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lifecycleForm, setLifecycleForm] = useState<any | null>(null);
  const [lifecycleSaving, setLifecycleSaving] = useState(false);
  const [lifecycleFeedback, setLifecycleFeedback] = useState<string | null>(null);
  const [bannerForm, setBannerForm] = useState<any | null>(null);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [bannerFeedback, setBannerFeedback] = useState<string | null>(null);

  async function load() {
    try {
      const results = await api.get<any[]>('/site-settings');
      setSettings(results);
      const lifecycle = results.find((s) => s.key === 'lifecycle_days');
      if (lifecycle) setLifecycleForm(lifecycle.value);
      const banner = results.find((s) => s.key === 'site_banner');
      if (banner) setBannerForm(banner.value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accès réservé à l'administration.");
    }
  }

  useEffect(() => { load(); }, []);

  async function toggle(key: string, current: unknown) {
    await api.patch(`/site-settings/${key}`, { value: !current });
    load();
  }

  async function saveLifecycle() {
    setLifecycleSaving(true);
    setLifecycleFeedback(null);
    try {
      await api.patch('/site-settings/lifecycle_days', { value: lifecycleForm });
      setLifecycleFeedback('Enregistré.');
      load();
    } catch (err) {
      setLifecycleFeedback(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setLifecycleSaving(false);
    }
  }

  async function saveBanner(bumpVersion: boolean) {
    setBannerSaving(true);
    setBannerFeedback(null);
    try {
      const value = { ...bannerForm, version: bumpVersion ? (bannerForm.version ?? 1) + 1 : (bannerForm.version ?? 1) };
      await api.patch('/site-settings/site_banner', { value });
      setBannerFeedback(bumpVersion ? 'Enregistré — réaffichée pour tout le monde, même ceux qui avaient fermé l\'ancienne.' : 'Enregistré.');
      load();
    } catch (err) {
      setBannerFeedback(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setBannerSaving(false);
    }
  }

  if (error) return <div className="error-banner">{error}</div>;

  const booleanSettings = settings.filter((s) => typeof s.value === 'boolean');
  const otherSettings = settings.filter((s) => typeof s.value !== 'boolean' && s.key !== 'lifecycle_days' && s.key !== 'site_banner');

  const LIFECYCLE_FIELDS: [string, string, string][] = [
    ['rejectionCorrectionDays', 'Jours pour corriger un signalement refusé', 'avant suppression définitive si non corrigé'],
    ['stalenessWarningDays', 'Jours avant le rappel « toujours valable? »', "après publication, si aucune confirmation reçue"],
    ['stalenessDeadlineDays', 'Jours additionnels après le rappel', 'avant archivage automatique si aucune confirmation'],
    ['archiveRetentionYears', 'Années de conservation en archive', 'avant suppression définitive (photos incluses)'],
    ['duplicateDetectionRadiusMeters', 'Rayon de détection de doublons (mètres)', 'pour proposer de réutiliser un signalement archivé'],
  ];

  return (
    <div>
      <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        Comportement de la plateforme
      </div>
      {booleanSettings.map((s) => (
        <div key={s.key} className="privacy-row">
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }}>{s.key}</span>
          <ToggleSwitch on={s.value} onToggle={() => toggle(s.key, s.value)} />
        </div>
      ))}

      <div className="section-label">Bannière de notification</div>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        Petit message affiché en haut du site, fermable individuellement par chaque visiteur.
        Modifier le texte et cliquer « Réafficher pour tout le monde » la fait réapparaître
        même pour ceux qui l'avaient déjà fermée.
      </p>
      {bannerForm && (
        <>
          <div className="privacy-row" style={{ marginBottom: 12 }}>
            <span style={{ fontSize: 12.5 }}>Bannière activée</span>
            <ToggleSwitch on={bannerForm.enabled} onToggle={() => setBannerForm({ ...bannerForm, enabled: !bannerForm.enabled })} />
          </div>
          <div className="field-group">
            <label className="field-label">Message (français)</label>
            <textarea rows={2} value={bannerForm.message ?? ''} onChange={(e) => setBannerForm({ ...bannerForm, message: e.target.value })} />
          </div>
          <div className="field-group">
            <label className="field-label">Message (anglais)</label>
            <textarea rows={2} value={bannerForm.messageEn ?? ''} onChange={(e) => setBannerForm({ ...bannerForm, messageEn: e.target.value })} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
            <div className="field-group" style={{ flex: 1 }}>
              <label className="field-label">Date de début (optionnel)</label>
              <input
                type="date"
                className="text-input"
                value={bannerForm.startDate ? bannerForm.startDate.slice(0, 10) : ''}
                onChange={(e) => setBannerForm({ ...bannerForm, startDate: e.target.value || null })}
              />
            </div>
            <div className="field-group" style={{ flex: 1 }}>
              <label className="field-label">Date de fin (optionnel)</label>
              <input
                type="date"
                className="text-input"
                value={bannerForm.endDate ? bannerForm.endDate.slice(0, 10) : ''}
                onChange={(e) => setBannerForm({ ...bannerForm, endDate: e.target.value || null })}
              />
            </div>
          </div>
          <div className="action-row" style={{ marginBottom: 20, flexWrap: 'wrap' }}>
            <button className="btn-ghost" onClick={() => saveBanner(false)} disabled={bannerSaving}>
              {bannerSaving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            <button className="btn-primary" onClick={() => saveBanner(true)} disabled={bannerSaving}>
              {bannerSaving ? 'Enregistrement...' : 'Enregistrer et réafficher pour tout le monde'}
            </button>
            {bannerFeedback && <span style={{ fontSize: 12, color: 'var(--status-resolved)' }}>{bannerFeedback}</span>}
          </div>
        </>
      )}

      <div className="section-label">Cycle de vie des signalements</div>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        Contrôle les délais du parcours complet d'un signalement : correction après refus,
        rappels de validité, archivage, et conservation des données archivées.
      </p>
      {lifecycleForm && LIFECYCLE_FIELDS.map(([key, label, hint]) => (
        <div key={key} className="field-group">
          <label className="field-label">{label}</label>
          <input
            type="number"
            min={1}
            className="text-input"
            value={lifecycleForm[key] ?? ''}
            onChange={(e) => setLifecycleForm({ ...lifecycleForm, [key]: Number(e.target.value) })}
          />
          <span style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{hint}</span>
        </div>
      ))}
      {lifecycleForm && (
        <div className="action-row" style={{ marginBottom: 20 }}>
          <button className="btn-primary" onClick={saveLifecycle} disabled={lifecycleSaving}>
            {lifecycleSaving ? 'Enregistrement...' : 'Enregistrer les délais'}
          </button>
          {lifecycleFeedback && <span style={{ fontSize: 12, color: 'var(--status-resolved)' }}>{lifecycleFeedback}</span>}
        </div>
      )}

      <div className="section-label">Autres paramètres</div>
      {otherSettings.map((s) => (
        <div key={s.key} className="privacy-row" style={{ alignItems: 'flex-start' }}>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, flexShrink: 0, marginRight: 12 }}>{s.key}</span>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', textAlign: 'right', wordBreak: 'break-word', maxWidth: 300 }}>
            {typeof s.value === 'string' ? s.value : JSON.stringify(s.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

function MunicipalitiesAdmin() {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const LIMIT = 30;

  const [selected, setSelected] = useState<any | null>(null);
  const [form, setForm] = useState<any>({});
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.get<{ results: any[]; total: number }>(
        `/municipality-integrations?search=${encodeURIComponent(search)}&limit=${LIMIT}&offset=${offset}&sortDir=${sortDir}`,
      );
      setResults(data.results);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accès réservé à l'administration.");
    }
  }

  useEffect(() => { load(); }, [offset, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setOffset(0); }, [search]);
  useEffect(() => { if (offset === 0) load(); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  function selectMunicipality(m: any) {
    setSelected(m);
    setForm({
      contactEmail: m.contact_email ?? '',
      contactPhone: m.contact_phone ?? '',
      contactWebsite: m.contact_website ?? '',
      mailingAddress: m.mailing_address ?? '',
      postalCode: m.postal_code ?? '',
      autoSendEnabled: m.auto_send_enabled,
    });
    setFeedback(null);
  }

  async function toggleAutoSend(m: any) {
    await api.patch(`/municipality-integrations/${m.id}/auto-send`, { enabled: !m.auto_send_enabled });
    load();
    if (selected?.id === m.id) setForm((f: any) => ({ ...f, autoSendEnabled: !f.autoSendEnabled }));
  }

  async function save() {
    if (!selected) return;
    setError(null);
    try {
      await api.post('/municipality-integrations', {
        regionId: selected.region_id,
        autoSendEnabled: form.autoSendEnabled,
        contactEmail: form.contactEmail || undefined,
        contactPhone: form.contactPhone || undefined,
        contactWebsite: form.contactWebsite || undefined,
        mailingAddress: form.mailingAddress || undefined,
        postalCode: form.postalCode || undefined,
      });
      setFeedback('Enregistré.');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    }
  }

  if (error) return <div className="error-banner">{error}</div>;

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 320px', minWidth: 280 }}>
        <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          Municipalités ({total})
        </div>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
          Source : Répertoire des municipalités du Québec (MAMH). L'envoi automatique est désactivé
          par défaut pour chacune — à activer ici une fois l'adresse vérifiée.
        </p>
        <div className="field-group">
          <input
            className="text-input"
            placeholder="Rechercher une municipalité..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          className="btn-ghost"
          style={{ marginBottom: 14, fontSize: 11.5 }}
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
        >
          {sortDir === 'asc' ? '↓ Ascendant (A-Z)' : '↑ Descendant (Z-A)'}
        </button>
        {results.map((m) => (
          <div
            key={m.id}
            className="report-card"
            style={{ borderColor: selected?.id === m.id ? 'var(--accent-signal)' : undefined }}
            onClick={() => selectMunicipality(m)}
          >
            <div className="rc-icon-hex">🏛️</div>
            <div className="rc-body">
              <div className="rc-title">{m.regionNameFr}</div>
              <div className="rc-meta">{m.contact_email ?? 'Aucun courriel'}</div>
            </div>
            <ToggleSwitch
              on={m.auto_send_enabled}
              onToggle={(e?: any) => { e?.stopPropagation?.(); toggleAutoSend(m); }}
              title={m.auto_send_enabled ? 'Envoi automatique activé' : 'Envoi automatique désactivé'}
            />
          </div>
        ))}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
          <button className="btn-ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>← Précédent</button>
          <span style={{ fontSize: 11.5, color: 'var(--text-muted)', alignSelf: 'center' }}>
            {offset + 1}–{Math.min(offset + LIMIT, total)} / {total}
          </span>
          <button className="btn-ghost" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>Suivant →</button>
        </div>
      </div>

      <div style={{ flex: '2 1 380px', minWidth: 300, background: 'var(--panel)', border: '1px solid var(--panel-border)', borderRadius: 12, padding: 20 }}>
        {!selected && <div className="center-msg">Sélectionne une municipalité à gauche.</div>}
        {selected && (
          <>
            {feedback && <div className="success-banner">{feedback}</div>}
            <div className="detail-title" style={{ fontSize: 17, marginBottom: 4 }}>{selected.regionNameFr}</div>
            {selected.mrc_name && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 16 }}>{selected.mrc_name}{selected.population ? ` · ${selected.population.toLocaleString('fr-CA')} habitants` : ''}</div>}

            <div className="privacy-row">
              <span>Envoi automatique des signalements approuvés</span>
              <ToggleSwitch on={form.autoSendEnabled} onToggle={() => setForm((f: any) => ({ ...f, autoSendEnabled: !f.autoSendEnabled }))} />
            </div>

            <div className="field-group" style={{ marginTop: 16 }}>
              <label className="field-label">Courriel de contact</label>
              <input className="text-input" value={form.contactEmail} onChange={(e) => setForm((f: any) => ({ ...f, contactEmail: e.target.value }))} />
            </div>
            <div className="field-group">
              <label className="field-label">Téléphone</label>
              <input className="text-input" value={form.contactPhone} onChange={(e) => setForm((f: any) => ({ ...f, contactPhone: e.target.value }))} />
            </div>
            <div className="field-group">
              <label className="field-label">Site web</label>
              <input className="text-input" value={form.contactWebsite} onChange={(e) => setForm((f: any) => ({ ...f, contactWebsite: e.target.value }))} />
            </div>
            <div className="field-group">
              <label className="field-label">Adresse postale</label>
              <input className="text-input" value={form.mailingAddress} onChange={(e) => setForm((f: any) => ({ ...f, mailingAddress: e.target.value }))} />
            </div>
            <div className="field-group">
              <label className="field-label">Code postal</label>
              <input className="text-input" value={form.postalCode} onChange={(e) => setForm((f: any) => ({ ...f, postalCode: e.target.value }))} />
            </div>

            <button className="btn-primary" onClick={save}>Enregistrer</button>
          </>
        )}
      </div>
    </div>
  );
}

const STATUS_LABELS_ALL: Record<string, string> = {
  pending_moderation: 'En modération',
  published_unresolved: 'Non résolu',
  published_resolved: 'Résolu',
  rejected: 'Refusé',
  withdrawn: 'Retiré',
};

function AllReportsAdmin() {
  const [results, setResults] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [sortBy, setSortBy] = useState<'created_at' | 'municipality'>('created_at');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const LIMIT = 30;

  async function load() {
    try {
      const params = new URLSearchParams({
        search, status, sortBy, sortDir, limit: String(LIMIT), offset: String(offset),
      });
      const data = await api.get<{ results: any[]; total: number }>(`/moderation/all-reports?${params}`);
      setResults(data.results);
      setTotal(data.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accès réservé à l'administration.");
    }
  }

  useEffect(() => { load(); }, [offset, status, sortBy, sortDir]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setOffset(0); }, [search, status]);
  useEffect(() => { if (offset === 0) load(); }, [search]); // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <div className="error-banner">{error}</div>;

  return (
    <div>
      <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        Tous les signalements ({total})
      </div>
      <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        Vue d'ensemble de TOUS les signalements de TOUS les usagers, peu importe le statut —
        pour la file d'approbation active, voir l'onglet « File de modération ».
      </p>

      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <input
          className="text-input"
          style={{ flex: '2 1 220px' }}
          placeholder="Rechercher (description, adresse, courriel, municipalité)..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select style={{ flex: '1 1 160px' }} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_LABELS_ALL).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        <select style={{ flex: '1 1 160px' }} value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
          <option value="created_at">Trier par date</option>
          <option value="municipality">Trier par municipalité</option>
        </select>
        <button className="btn-ghost" onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}>
          {sortDir === 'asc' ? '↓ Ascendant' : '↑ Descendant'}
        </button>
      </div>

      {results.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Aucun signalement pour ces filtres.</div>}
      {results.map((r) => (
        <div key={r.id} className="report-card" style={{ cursor: 'default' }}>
          {r.thumbnailUrl ? (
            <div className="rc-thumb-wrap">
              <img src={r.thumbnailUrl} alt="" className={`rc-icon-hex rc-thumb ${r.status === 'published_resolved' ? 'resolved' : ''}`} />
              <span className="rc-type-badge">{r.problemTypeIcon ?? '📍'}</span>
            </div>
          ) : (
            <div className={`rc-icon-hex ${r.status === 'published_resolved' ? 'resolved' : ''}`}>
              {r.problemTypeIcon ?? '📍'}
            </div>
          )}
          <div className="rc-body">
            <div className="rc-title">{r.problemTypeNameFr} {r.municipalityName ? `— ${r.municipalityName}` : ''}</div>
            <div className="rc-meta">
              {r.authorEmail ?? 'Anonyme'} · {r.addressText ?? 'GPS'} · {new Date(r.created_at).toLocaleDateString('fr-CA')}
            </div>
          </div>
          <span className={`pill ${statusPillClass(r.status)}`}>
            {STATUS_LABELS_ALL[r.status] ?? r.status}
          </span>
        </div>
      ))}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14 }}>
        <button className="btn-ghost" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - LIMIT))}>← Précédent</button>
        <span style={{ fontSize: 11.5, color: 'var(--text-muted)', alignSelf: 'center' }}>
          {total === 0 ? 0 : offset + 1}–{Math.min(offset + LIMIT, total)} / {total}
        </span>
        <button className="btn-ghost" disabled={offset + LIMIT >= total} onClick={() => setOffset(offset + LIMIT)}>Suivant →</button>
      </div>
    </div>
  );
}

function EmailTemplatesAdmin() {
  const [templates, setTemplates] = useState<any[]>([]);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [bodyHtml, setBodyHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ subject: string; bodyHtml: string } | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);

  async function load() {
    try {
      const results = await api.get<any[]>('/email-templates');
      setTemplates(results);
      if (!selectedKey && results[0]) select(results[0]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accès réservé à l'administration.");
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function select(t: any) {
    setSelectedKey(t.key);
    setSubject(t.subject);
    setBodyHtml(t.body_html);
    setPreview(null);
    setFeedback(null);
  }

  async function save() {
    if (!selectedKey) return;
    setSaving(true);
    setFeedback(null);
    try {
      await api.patch(`/email-templates/${selectedKey}`, { subject, bodyHtml });
      setFeedback('Enregistré.');
      load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  }

  async function showPreview() {
    if (!selectedKey) return;
    setLoadingPreview(true);
    try {
      const result = await api.get<{ subject: string; bodyHtml: string }>(`/email-templates/${selectedKey}/preview`);
      setPreview(result);
    } catch {
      setPreview(null);
    } finally {
      setLoadingPreview(false);
    }
  }

  const selected = templates.find((t) => t.key === selectedKey);

  if (error) return <div className="error-banner">{error}</div>;

  return (
    <div style={{ display: 'flex', gap: 20 }}>
      <div style={{ flex: '0 0 240px' }}>
        <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          Gabarits de courriels
        </div>
        {templates.map((t) => (
          <div
            key={t.key}
            onClick={() => select(t)}
            className="report-card"
            style={{ cursor: 'pointer', borderColor: t.key === selectedKey ? 'var(--accent-signal)' : undefined }}
          >
            <div className="rc-body">
              <div className="rc-title" style={{ fontSize: 12.5 }}>{t.key}</div>
              <div className="rc-meta" style={{ fontSize: 10.5 }}>{t.description}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        {selected && (
          <>
            <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
              {selected.key}
            </div>
            <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 14 }}>{selected.description}</p>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
              {selected.available_variables.map((v: string) => (
                <span
                  key={v}
                  style={{
                    fontFamily: 'var(--font-mono)', fontSize: 10.5, background: 'var(--panel-hover)',
                    border: '1px solid var(--panel-border)', borderRadius: 6, padding: '3px 8px', cursor: 'pointer',
                  }}
                  title="Cliquer pour copier"
                  onClick={() => navigator.clipboard.writeText(`{{${v}}}`)}
                >
                  {'{{'}{v}{'}}'}
                </span>
              ))}
            </div>

            <div className="field-group">
              <label className="field-label">Sujet</label>
              <input className="text-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
            <div className="field-group">
              <label className="field-label">Corps (HTML)</label>
              <textarea rows={10} style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5 }} value={bodyHtml} onChange={(e) => setBodyHtml(e.target.value)} />
            </div>

            <div className="action-row" style={{ flexWrap: 'wrap' }}>
              <button className="btn-primary" onClick={save} disabled={saving}>
                {saving ? 'Enregistrement...' : 'Enregistrer'}
              </button>
              <button className="btn-ghost" onClick={showPreview} disabled={loadingPreview}>
                {loadingPreview ? 'Chargement...' : '👁 Prévisualiser'}
              </button>
              {feedback && <span style={{ fontSize: 12, color: 'var(--status-resolved)' }}>{feedback}</span>}
            </div>

            {preview && (
              <div style={{ marginTop: 20 }}>
                <div className="section-label">Aperçu (avec des données d'exemple)</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 8 }}>
                  Sujet : <strong style={{ color: 'var(--text-body)' }}>{preview.subject}</strong>
                </div>
                <div
                  style={{
                    background: '#0A0B0E', border: '1px solid var(--panel-border)', borderRadius: 10,
                    padding: 20, maxHeight: 500, overflowY: 'auto',
                  }}
                >
                  <iframe
                    title="Aperçu du courriel"
                    style={{ width: '100%', height: 480, border: 'none', background: 'white', borderRadius: 6 }}
                    srcDoc={`<body style="margin:0;background:#0A0B0E;font-family:sans-serif;color:#F5F6F8;padding:20px;">${preview.bodyHtml}</body>`}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const TICKET_STATUS_LABELS: Record<string, string> = {
  open: 'Ouvert',
  in_progress: 'En cours',
  resolved: 'Résolu',
};

function SupportTicketsAdmin() {
  const [tickets, setTickets] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ ticket: any; replies: any[] } | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadList() {
    try {
      const params = statusFilter ? `?status=${statusFilter}` : '';
      const results = await api.get<any[]>(`/support/admin/tickets${params}`);
      setTickets(results);
      if (!selectedId && results[0]) setSelectedId(results[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accès réservé à l'administration.");
    }
  }

  async function loadDetail(id: string) {
    const result = await api.get<{ ticket: any; replies: any[] }>(`/support/admin/tickets/${id}`);
    setDetail(result);
  }

  useEffect(() => { loadList(); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId]);

  async function sendReply() {
    if (!selectedId || !replyText.trim()) return;
    setSending(true);
    setFeedback(null);
    try {
      await api.post(`/support/admin/tickets/${selectedId}/reply`, { message: replyText });
      setReplyText('');
      setFeedback('Réponse envoyée.');
      loadDetail(selectedId);
      loadList();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSending(false);
    }
  }

  async function changeStatus(status: string) {
    if (!selectedId) return;
    await api.patch(`/support/admin/tickets/${selectedId}/status`, { status });
    loadDetail(selectedId);
    loadList();
  }

  if (error) return <div className="error-banner">{error}</div>;

  return (
    <div style={{ display: 'flex', gap: 16 }}>
      <div style={{ flex: '1 1 280px', minWidth: 260 }}>
        <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          Tickets de support ({tickets.length})
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ width: '100%', marginBottom: 12 }}>
          <option value="">Tous les statuts</option>
          {Object.entries(TICKET_STATUS_LABELS).map(([key, label]) => (
            <option key={key} value={key}>{label}</option>
          ))}
        </select>
        {tickets.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Aucun ticket.</div>}
        {tickets.map((t) => (
          <div
            key={t.id}
            className="report-card"
            style={{ cursor: 'pointer', borderColor: t.id === selectedId ? 'var(--accent-signal)' : undefined }}
            onClick={() => setSelectedId(t.id)}
          >
            <div className="rc-body">
              <div className="rc-title" style={{ fontSize: 12.5 }}>{t.subject}</div>
              <div className="rc-meta" style={{ fontSize: 10.5 }}>{t.email} · {new Date(t.created_at).toLocaleDateString('fr-CA')}</div>
            </div>
            <span className={`pill ${t.status === 'resolved' ? 'resolved' : t.status === 'in_progress' ? 'unresolved' : ''}`}>
              {TICKET_STATUS_LABELS[t.status]}
            </span>
          </div>
        ))}
      </div>

      <div style={{ flex: '2 1 380px', minWidth: 300, background: 'var(--panel)', border: '1px solid var(--panel-border)', borderRadius: 12, padding: 20 }}>
        {!detail && <div className="center-msg">Sélectionne un ticket à gauche.</div>}
        {detail && (
          <>
            <div className="detail-title" style={{ fontSize: 17 }}>{detail.ticket.subject}</div>
            <div className="detail-meta-row" style={{ margin: '8px 0 16px' }}>
              <span>✉️ {detail.ticket.email}</span>
              {detail.ticket.name && <span>👤 {detail.ticket.name}</span>}
              <span>{detail.ticket.created_by === 'ai' ? '🤖 Créé par le chat IA' : '✍️ Créé manuellement'}</span>
            </div>

            <div style={{
              background: 'var(--panel-hover)', border: '1px solid var(--panel-border)', borderRadius: 10,
              padding: 14, marginBottom: 16, fontSize: 12.5, lineHeight: 1.6, whiteSpace: 'pre-wrap', maxHeight: 260, overflowY: 'auto',
            }}>
              {detail.ticket.description}
            </div>

            {detail.replies.length > 0 && (
              <>
                <div className="section-label" style={{ fontSize: 13 }}>Réponses</div>
                {detail.replies.map((r) => (
                  <div key={r.id} className="comment">
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 3 }}>
                      {r.author_type === 'admin' ? 'Équipe mon511.ca' : 'Usager'} · {new Date(r.created_at).toLocaleString('fr-CA')}
                    </div>
                    {r.message}
                  </div>
                ))}
              </>
            )}

            <div className="section-label" style={{ fontSize: 13 }}>Répondre</div>
            <div className="field-group">
              <textarea rows={3} value={replyText} onChange={(e) => setReplyText(e.target.value)} placeholder="Ta réponse (envoyée par courriel à l'usager)..." />
            </div>
            <div className="action-row" style={{ flexWrap: 'wrap' }}>
              <button className="btn-primary" onClick={sendReply} disabled={sending || !replyText.trim()}>
                {sending ? 'Envoi...' : 'Envoyer la réponse'}
              </button>
              {detail.ticket.status !== 'resolved' ? (
                <button className="btn-ghost" onClick={() => changeStatus('resolved')}>✔ Marquer résolu</button>
              ) : (
                <button className="btn-ghost" onClick={() => changeStatus('open')}>↺ Rouvrir</button>
              )}
              {feedback && <span style={{ fontSize: 12, color: 'var(--status-resolved)' }}>{feedback}</span>}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function MunicipalPortalAdmin() {
  const [requests, setRequests] = useState<any[]>([]);
  const [municipalities, setMunicipalities] = useState<any[]>([]);
  const [subTab, setSubTab] = useState<'requests' | 'municipalities'>('requests');

  async function load() {
    const [reqs, munis] = await Promise.all([
      api.get<any[]>('/municipal-portal/admin/access-requests'),
      api.get<any[]>('/municipal-portal/admin/municipalities'),
    ]);
    setRequests(reqs);
    setMunicipalities(munis);
  }

  useEffect(() => { load(); }, []);

  async function approve(id: string) {
    await api.post(`/municipal-portal/admin/access-requests/${id}/approve`, {});
    load();
  }

  async function reject(id: string) {
    await api.post(`/municipal-portal/admin/access-requests/${id}/reject`, {});
    load();
  }

  async function toggleTier(regionId: string, current: string) {
    await api.patch(`/municipal-portal/admin/municipalities/${regionId}/tier`, { tier: current === 'premium' ? 'free' : 'premium' });
    load();
  }

  return (
    <div>
      <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
        Portail municipal
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button className={`tab-item ${subTab === 'requests' ? 'active' : ''}`} onClick={() => setSubTab('requests')}>
          Demandes d'accès {requests.length > 0 && `(${requests.length})`}
        </button>
        <button className={`tab-item ${subTab === 'municipalities' ? 'active' : ''}`} onClick={() => setSubTab('municipalities')}>
          Municipalités actives
        </button>
      </div>

      {subTab === 'requests' && (
        <>
          {requests.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Aucune demande en attente.</p>}
          {requests.map((r) => (
            <div key={r.id} className="report-card" style={{ cursor: 'default' }}>
              <div className="rc-body">
                <div className="rc-title">{r.first_name} {r.last_name} — {r.regionName}</div>
                <div className="rc-meta">
                  {r.job_title} · {r.email} · {r.requested_role === 'municipal_admin' ? 'Administrateur municipal' : 'Employé municipal'}
                </div>
                {r.message && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6, fontStyle: 'italic' }}>« {r.message} »</div>}
              </div>
              <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                <button className="btn-primary" style={{ fontSize: 11.5 }} onClick={() => approve(r.id)}>Approuver</button>
                <button className="btn-ghost btn-danger" style={{ fontSize: 11.5 }} onClick={() => reject(r.id)}>Refuser</button>
              </div>
            </div>
          ))}
        </>
      )}

      {subTab === 'municipalities' && (
        <>
          {municipalities.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Aucune municipalité active pour l'instant.</p>}
          {municipalities.map((m) => (
            <div key={m.regionId} className="privacy-row">
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{m.regionName}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.staffCount} employé(s) avec accès</div>
              </div>
              <button
                className="btn-ghost"
                style={{ fontSize: 11.5, color: m.tier === 'premium' ? 'var(--accent-signal)' : undefined }}
                onClick={() => toggleTier(m.regionId, m.tier ?? 'free')}
              >
                {m.tier === 'premium' ? '⭐ Premium' : 'Gratuit'} — cliquer pour changer
              </button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
