import { useEffect, useState } from 'react';
import { api } from '../api';
import ToggleSwitch from '../components/ToggleSwitch';

interface Props {
  onClose: () => void;
}

type Tab = 'queue' | 'types' | 'external' | 'users' | 'settings';

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
          <button className={`tab-item ${tab === 'settings' ? 'active' : ''}`} onClick={() => setTab('settings')}>
            Paramètres
          </button>
        </div>

        {tab === 'queue' && <ModerationQueue />}
        {tab === 'types' && <ProblemTypesAdmin />}
        {tab === 'external' && <ExternalDataAdmin />}
        {tab === 'users' && <UsersAdmin />}
        {tab === 'settings' && <SiteSettingsAdmin />}
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
    <div>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 28 }}>
        <div style={{ flex: '1 1 280px', minWidth: 260 }}>
          <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
            En attente d'approbation ({queue.length})
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
      {users.map((u) => (
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

  async function load() {
    try {
      const results = await api.get<any[]>('/site-settings');
      setSettings(results);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Accès réservé à l'administration.");
    }
  }

  useEffect(() => { load(); }, []);

  async function toggle(key: string, current: unknown) {
    await api.patch(`/site-settings/${key}`, { value: !current });
    load();
  }

  if (error) return <div className="error-banner">{error}</div>;

  const booleanSettings = settings.filter((s) => typeof s.value === 'boolean');
  const otherSettings = settings.filter((s) => typeof s.value !== 'boolean');

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
