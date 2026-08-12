import { useEffect, useState } from 'react';
import { api, getToken, setToken, clearToken } from './api';

type Tab = 'reports' | 'stats' | 'comparatives';

function LoginScreen({ onLoggedIn }: { onLoggedIn: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const result = await api.post<{ accessToken: string }>('/auth/login', { email, password });
      setToken(result.accessToken);
      onLoggedIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de connexion.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ width: 380 }}>
        <div className="topbar-title" style={{ marginBottom: 4, fontSize: 20 }}>Portail municipal</div>
        <div className="topbar-sub" style={{ marginBottom: 24 }}>mon511.ca — pour les municipalités partenaires</div>
        {error && <div className="error-banner">{error}</div>}
        <form onSubmit={submit}>
          <div className="field-group">
            <label className="field-label">Courriel</label>
            <input className="text-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="field-group">
            <label className="field-label">Mot de passe</label>
            <input className="text-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button className="btn-primary" style={{ width: '100%' }} disabled={loading}>
            {loading ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
        <p style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 16, lineHeight: 1.6 }}>
          Utilise le même compte que sur mon511.ca. Pas encore d'accès au portail? Connecte-toi, tu pourras faire ta demande à l'étape suivante.
        </p>
      </div>
    </div>
  );
}

function AccessRequestScreen({ status, onSubmitted }: { status: string; onSubmitted: () => void }) {
  const [regionSearch, setRegionSearch] = useState('');
  const [regionResults, setRegionResults] = useState<any[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<any | null>(null);
  const [jobTitle, setJobTitle] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (regionSearch.trim().length < 2) { setRegionResults([]); return; }
    const timeout = setTimeout(() => {
      api.get<any[]>(`/municipal-portal/search-regions?search=${encodeURIComponent(regionSearch)}`)
        .then(setRegionResults)
        .catch(() => setRegionResults([]));
    }, 300);
    return () => clearTimeout(timeout);
  }, [regionSearch]);

  async function submit() {
    if (!selectedRegion || !jobTitle.trim()) {
      setError('La municipalité et ton titre de poste sont requis.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/municipal-portal/request-access', { regionId: selectedRegion.regionId, jobTitle, message });
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSubmitting(false);
    }
  }

  if (status === 'pending') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div className="card" style={{ width: 420, textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Demande en attente</div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6 }}>
            Ta demande d'accès a été envoyée à notre équipe. Tu recevras un courriel dès qu'elle sera approuvée.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div className="card" style={{ width: 440 }}>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Demander l'accès au portail</div>
        <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 18, lineHeight: 1.6 }}>
          Ce portail est réservé aux employés des municipalités partenaires. Une fois ta demande approuvée par notre équipe, tu auras accès au tableau de bord de ta municipalité.
        </p>
        {status === 'rejected' && (
          <div className="error-banner">Ta demande précédente n'a pas été approuvée. Tu peux en soumettre une nouvelle si la situation a changé.</div>
        )}
        {error && <div className="error-banner">{error}</div>}
        <div className="field-group" style={{ position: 'relative' }}>
          <label className="field-label">Ta municipalité</label>
          {selectedRegion ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--panel-hover)', padding: '10px 12px', borderRadius: 8 }}>
              <span>{selectedRegion.regionNameFr}</span>
              <button className="btn-ghost" style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setSelectedRegion(null)}>Changer</button>
            </div>
          ) : (
            <input className="text-input" placeholder="Chercher ta municipalité..." value={regionSearch} onChange={(e) => setRegionSearch(e.target.value)} />
          )}
          {!selectedRegion && regionResults.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--panel)', border: '1px solid var(--panel-border)', borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 200, overflowY: 'auto' }}>
              {regionResults.map((r) => (
                <div
                  key={r.id}
                  onClick={() => { setSelectedRegion(r); setRegionResults([]); }}
                  style={{ padding: '10px 12px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid var(--panel-border)' }}
                >
                  {r.regionNameFr}
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="field-group">
          <label className="field-label">Ton titre de poste</label>
          <input className="text-input" placeholder="Ex. Directeur des travaux publics" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </div>
        <div className="field-group">
          <label className="field-label">Message (optionnel)</label>
          <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
        </div>
        <button className="btn-primary" style={{ width: '100%' }} onClick={submit} disabled={submitting}>
          {submitting ? 'Envoi...' : 'Envoyer la demande'}
        </button>
      </div>
    </div>
  );
}

const STATUS_LABELS: Record<string, string> = {
  published_unresolved: 'Non résolu', published_resolved: 'Résolu', archived: 'Archivé',
};
const INTERNAL_STATUS_LABELS: Record<string, string> = {
  new: 'Nouveau', acknowledged: 'Pris en note', in_progress: 'En traitement', done: 'Terminé',
};

function ReportsTab() {
  const [reports, setReports] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [assignedTo, setAssignedTo] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    const params = statusFilter ? `?status=${statusFilter}` : '';
    const results = await api.get<any[]>(`/municipal-portal/reports${params}`);
    setReports(results);
  }

  useEffect(() => { load(); }, [statusFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function select(r: any) {
    setSelected(r);
    setAssignedTo(r.assignedTo ?? '');
    setInternalNotes(r.internalNotes ?? '');
  }

  async function saveTracking(internalStatus?: string) {
    if (!selected) return;
    setSaving(true);
    try {
      await api.patch(`/municipal-portal/reports/${selected.id}/tracking`, {
        internalStatus: internalStatus ?? selected.internalStatus ?? 'new',
        assignedTo,
        internalNotes,
      });
      await load();
      setSelected(null);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ display: 'flex', gap: 20 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Signalements ({reports.length})</div>
          <select style={{ width: 200 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">Tous les statuts</option>
            <option value="published_unresolved">Non résolu</option>
            <option value="published_resolved">Résolu</option>
            <option value="archived">Archivé</option>
          </select>
        </div>
        <table>
          <thead>
            <tr><th>Type</th><th>Adresse</th><th>Statut public</th><th>Suivi interne</th><th>Créé le</th></tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id} onClick={() => select(r)} style={{ cursor: 'pointer' }}>
                <td>{r.problemTypeIcon} {r.problemTypeNameFr}</td>
                <td>{r.addressText ?? 'GPS'}</td>
                <td><span className={`pill ${r.status === 'published_resolved' ? 'resolved' : r.status === 'archived' ? 'archived' : 'unresolved'}`}>{STATUS_LABELS[r.status] ?? r.status}</span></td>
                <td>{INTERNAL_STATUS_LABELS[r.internalStatus ?? 'new']}</td>
                <td>{new Date(r.created_at).toLocaleDateString('fr-CA')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {reports.length === 0 && <div className="center-msg">Aucun signalement pour ce filtre.</div>}
      </div>

      {selected && (
        <div className="card" style={{ flex: '0 0 320px', height: 'fit-content' }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{selected.problemTypeIcon} {selected.problemTypeNameFr}</div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>{selected.addressText ?? 'Position GPS'}</div>

          <div className="field-group">
            <label className="field-label">Statut interne</label>
            <select value={selected.internalStatus ?? 'new'} onChange={(e) => { setSelected({ ...selected, internalStatus: e.target.value }); }}>
              {Object.entries(INTERNAL_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div className="field-group">
            <label className="field-label">Assigné à</label>
            <input className="text-input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder="Nom de l'employé" />
          </div>
          <div className="field-group">
            <label className="field-label">Notes internes</label>
            <textarea rows={4} value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-primary" style={{ flex: 1 }} onClick={() => saveTracking(selected.internalStatus)} disabled={saving}>
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
            <button className="btn-ghost" onClick={() => setSelected(null)}>Fermer</button>
          </div>
        </div>
      )}
    </div>
  );
}

function StatsTab() {
  const [stats, setStats] = useState<any | null>(null);

  useEffect(() => { api.get<any>('/municipal-portal/stats').then(setStats).catch(() => {}); }, []);

  if (!stats) return <div className="center-msg">Chargement...</div>;

  return (
    <div>
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-value">{stats.byStatus.reduce((sum: number, s: any) => sum + Number(s.count), 0)}</div>
          <div className="stat-label">Total des signalements</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.avgResolutionDays ?? '—'}</div>
          <div className="stat-label">Jours moyens avant résolution</div>
        </div>
        {stats.byStatus.map((s: any) => (
          <div className="stat-card" key={s.status}>
            <div className="stat-value">{s.count}</div>
            <div className="stat-label">{STATUS_LABELS[s.status] ?? s.status}</div>
          </div>
        ))}
      </div>

      <div className="card">
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 14 }}>Répartition par type</div>
        {stats.byType.map((t: any) => (
          <div key={t.type} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--panel-border)', fontSize: 13 }}>
            <span>{t.type}</span>
            <span style={{ color: 'var(--accent-signal)', fontWeight: 700 }}>{t.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ComparativesTab() {
  const [data, setData] = useState<any | null>(null);
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    api.get<any>('/municipal-portal/comparatives')
      .then(setData)
      .catch((err) => { if (err.message?.includes('premium')) setLocked(true); });
  }, []);

  if (locked) {
    return (
      <div className="premium-lock">
        <div style={{ fontSize: 24, marginBottom: 10 }}>🔒</div>
        <div style={{ fontWeight: 600, marginBottom: 6, color: 'var(--text-body)' }}>Fonction premium</div>
        Les comparatifs entre municipalités font partie du palier premium. Contacte-nous à info@mon511.ca pour en savoir plus.
      </div>
    );
  }

  if (!data) return <div className="center-msg">Chargement...</div>;
  if (!data.comparable) return <div className="center-msg">Pas assez de données comparables pour l'instant (population ou historique insuffisant).</div>;

  const diff = data.myAvgResolutionDays && data.comparableAvgResolutionDays
    ? Math.round(((data.comparableAvgResolutionDays - data.myAvgResolutionDays) / data.comparableAvgResolutionDays) * 100)
    : null;

  return (
    <div className="card">
      <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Comparaison avec {data.similarMunicipalitiesCount} municipalités de population comparable</div>
      <div className="stat-grid" style={{ marginTop: 18 }}>
        <div className="stat-card">
          <div className="stat-value">{data.myAvgResolutionDays ?? '—'}</div>
          <div className="stat-label">Vos jours moyens de résolution</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{data.comparableAvgResolutionDays ?? '—'}</div>
          <div className="stat-label">Moyenne des municipalités comparables</div>
        </div>
      </div>
      {diff !== null && (
        <p style={{ fontSize: 13, color: diff >= 0 ? 'var(--status-resolved)' : 'var(--status-danger)' }}>
          {diff >= 0
            ? `Votre municipalité résout ses signalements ${diff}% plus vite que la moyenne comparable. 🎉`
            : `Votre municipalité résout ses signalements ${Math.abs(diff)}% moins vite que la moyenne comparable.`}
        </p>
      )}
    </div>
  );
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [tab, setTab] = useState<Tab>('reports');

  return (
    <div className="app-shell">
      <div className="topbar">
        <div>
          <div className="topbar-title">Portail municipal</div>
          <div className="topbar-sub">mon511.ca</div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a className="btn-ghost" style={{ textDecoration: 'none' }} href={`${import.meta.env.VITE_API_URL ?? 'http://localhost:3000'}/api/municipal-portal/export.csv`} target="_blank" rel="noreferrer">
            ⬇ Exporter (CSV)
          </a>
          <button className="btn-ghost" onClick={onLogout}>Se déconnecter</button>
        </div>
      </div>
      <div className="tabs">
        <button className={`tab-item ${tab === 'reports' ? 'active' : ''}`} onClick={() => setTab('reports')}>Signalements</button>
        <button className={`tab-item ${tab === 'stats' ? 'active' : ''}`} onClick={() => setTab('stats')}>Statistiques</button>
        <button className={`tab-item ${tab === 'comparatives' ? 'active' : ''}`} onClick={() => setTab('comparatives')}>Comparatifs</button>
      </div>
      <div className="main-content">
        {tab === 'reports' && <ReportsTab />}
        {tab === 'stats' && <StatsTab />}
        {tab === 'comparatives' && <ComparativesTab />}
      </div>
    </div>
  );
}

export default function App() {
  const [loggedIn, setLoggedIn] = useState(!!getToken());
  const [accessStatus, setAccessStatus] = useState<string | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  async function refreshAccessStatus() {
    setLoadingStatus(true);
    try {
      const result = await api.get<{ status: string }>('/municipal-portal/my-access-status');
      setAccessStatus(result.status);
    } catch {
      clearToken();
      setLoggedIn(false);
    } finally {
      setLoadingStatus(false);
    }
  }

  useEffect(() => {
    if (loggedIn) refreshAccessStatus();
    else setLoadingStatus(false);
  }, [loggedIn]);

  function handleLogout() {
    clearToken();
    setLoggedIn(false);
    setAccessStatus(null);
  }

  if (!loggedIn) return <LoginScreen onLoggedIn={() => setLoggedIn(true)} />;
  if (loadingStatus) return <div className="center-msg" style={{ paddingTop: 100 }}>Chargement...</div>;
  if (accessStatus === 'approved') return <Dashboard onLogout={handleLogout} />;
  return <AccessRequestScreen status={accessStatus ?? 'none'} onSubmitted={refreshAccessStatus} />;
}
