import { useEffect, useState } from 'react';
import { api } from '../api';

interface Props {
  onClose: () => void;
}

type Tab = 'queue' | 'types' | 'external';

export default function AdminPage({ onClose }: Props) {
  const [tab, setTab] = useState<Tab>('queue');

  return (
    <div className="app-full" style={{ position: 'fixed', background: 'var(--bg-asphalt)', overflowY: 'auto' }}>
      <header className="topbar-float" style={{ position: 'sticky', background: 'var(--bg-asphalt)' }}>
        <div className="brand-row">
          <span className="brand-mark">511</span>
          <span className="brand-name">Administration</span>
        </div>
        <button className="btn-ghost" onClick={onClose}>← Retour à la carte</button>
      </header>

      <div style={{ maxWidth: 900, margin: '0 auto', padding: '20px 24px 60px' }}>
        <div className="tabs" style={{ maxWidth: 480, marginBottom: 24 }}>
          <button className={`tab-item ${tab === 'queue' ? 'active' : ''}`} onClick={() => setTab('queue')}>
            File de modération
          </button>
          <button className={`tab-item ${tab === 'types' ? 'active' : ''}`} onClick={() => setTab('types')}>
            Catégories &amp; types
          </button>
          <button className={`tab-item ${tab === 'external' ? 'active' : ''}`} onClick={() => setTab('external')}>
            Données officielles
          </button>
        </div>

        {tab === 'queue' && <ModerationQueue />}
        {tab === 'types' && <ProblemTypesAdmin />}
        {tab === 'external' && <ExternalDataAdmin />}
      </div>
    </div>
  );
}

function ModerationQueue() {
  const [queue, setQueue] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);
  const [reason, setReason] = useState('');
  const [reply, setReply] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadQueue() {
    try {
      const results = await api.get<any[]>('/moderation/queue');
      setQueue(results);
      if (!selectedId && results[0]) setSelectedId(results[0].id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de charger la file — accès réservé aux modérateurs.');
    }
  }

  async function loadDetail(id: string) {
    try {
      const d = await api.get<any>(`/moderation/${id}`);
      setDetail(d);
    } catch {
      setDetail(null);
    }
  }

  useEffect(() => { loadQueue(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId]);

  async function decide(decision: 'approve' | 'reject') {
    if (!selectedId) return;
    if (decision === 'reject' && !reason.trim()) {
      setError('Un motif est obligatoire pour refuser un signalement.');
      return;
    }
    try {
      await api.patch(`/moderation/${selectedId}/decision`, { decision, reason: reason || undefined });
      setFeedback(decision === 'approve' ? 'Signalement approuvé.' : 'Signalement refusé.');
      setReason('');
      setSelectedId(null);
      setDetail(null);
      loadQueue();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action impossible.');
    }
  }

  async function sendReply() {
    if (!selectedId || !reply.trim()) return;
    try {
      await api.post(`/moderation/${selectedId}/reply`, { message: reply });
      setReply('');
      loadDetail(selectedId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible.');
    }
  }

  if (error) return <div className="error-banner">{error}</div>;

  return (
    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 280px', minWidth: 260 }}>
        <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
          En attente ({queue.length})
        </div>
        {queue.length === 0 && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Aucun signalement en attente.</div>}
        {queue.map((r) => (
          <div
            key={r.id}
            className="report-card"
            style={{ borderColor: selectedId === r.id ? 'var(--accent-signal)' : undefined }}
            onClick={() => setSelectedId(r.id)}
          >
            <div className="rc-icon-hex">{r.problemTypeIcon ?? '📍'}</div>
            <div className="rc-body">
              <div className="rc-title">{r.problemTypeNameFr}</div>
              <div className="rc-meta">{r.address_text ?? 'Position GPS'}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ flex: '2 1 380px', minWidth: 300, background: 'var(--panel)', border: '1px solid var(--panel-border)', borderRadius: 12, padding: 20 }}>
        {!detail && <div className="center-msg">Sélectionne un signalement à gauche.</div>}
        {detail && (
          <>
            {feedback && <div className="success-banner">{feedback}</div>}
            <div className="detail-title" style={{ fontSize: 17 }}>{detail.report.description || 'Signalement'}</div>
            <div className="detail-meta-row" style={{ margin: '8px 0 16px' }}>
              <span>📍 {detail.report.address_text ?? 'Position GPS'}</span>
              <span>🏛️ Municipalité avisée : {detail.report.municipality_notified}</span>
            </div>

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
      </div>
    </div>
  );
}

function ExternalDataAdmin() {
  const [sources, setSources] = useState<any[]>([]);
  const [syncing, setSyncing] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

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
        [feedKey]: result.synced ? `✔ ${result.count} incidents synchronisés` : `✕ ${result.reason}`,
      }));
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
            <div className="rc-title">{s.regionNameFr ?? s.id}</div>
            <div className="rc-meta">{results[s.feed_key] ?? (s.auto_send_enabled ? 'Actif' : '')}</div>
          </div>
        </div>
      ))}
      {/* Sources connues câblées directement (feed_key fixes du seed) */}
      {['mtmd_travaux_routiers', 'mtmd_conditions_hivernales'].map((key) => (
        <div key={key} className="report-card" style={{ cursor: 'default' }}>
          <div className="rc-icon-hex official">🏛️</div>
          <div className="rc-body">
            <div className="rc-title">{key === 'mtmd_travaux_routiers' ? 'Travaux routiers' : 'Conditions routières hivernales'}</div>
            <div className="rc-meta">{results[key] ?? '—'}</div>
          </div>
          <button className="btn-ghost" onClick={() => sync(key)} disabled={syncing === key}>
            {syncing === key ? 'Synchronisation...' : 'Synchroniser'}
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
          <button className="btn-ghost" onClick={() => toggleActive(t.id, t.active)}>
            {t.active ? 'Actif' : 'Inactif'}
          </button>
        </div>
      ))}
    </div>
  );
}
