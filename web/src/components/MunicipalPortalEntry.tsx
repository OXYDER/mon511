import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import MapView, { MapPin } from './MapView';

interface Props {
  lang: 'fr' | 'en';
  onClose: () => void;
}

/** Fenêtre quasi plein écran du portail municipal — structure
 * VOLONTAIREMENT IDENTIQUE à l'interface d'administration (mêmes
 * classes CSS .app-full/.admin-layout/.admin-sidebar/
 * .admin-hamburger-btn, jamais une variante parallèle .portal-*) pour
 * garantir un comportement identique, y compris sur mobile — demandé
 * explicitement après un premier essai avec des classes séparées qui
 * risquait de dériver subtilement de l'admin avec le temps.
 *
 * Affiche l'un de trois écrans selon le statut réel de l'usager,
 * vérifié CÔTÉ SERVEUR à chaque ouverture (jamais seulement le rôle
 * stocké dans le jeton, qui pourrait être périmé) :
 * - 'none' : formulaire de demande d'accès
 * - 'pending' : page d'attente, aucune interaction possible
 * - 'approved' : le vrai portail, avec navigation latérale
 *
 * IMPORTANT : un compte sans le rôle municipal_staff/municipal_admin
 * ne voit donc JAMAIS le contenu du portail, peu importe ce qu'il
 * tente — il voit soit le formulaire de demande, soit la page
 * d'attente, jamais une erreur.
 */
export default function MunicipalPortalEntry({ lang, onClose }: Props) {
  const [status, setStatus] = useState<{ status: 'none' | 'pending' | 'approved'; role?: string; regionName?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('dashboard');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const fr = lang === 'fr';

  useEffect(() => {
    api.get<any>('/municipal-portal/my-access-status')
      .then(setStatus)
      .catch(() => setStatus({ status: 'none' }))
      .finally(() => setLoading(false));
  }, []);

  return createPortal(
    <div className="app-full" style={{ position: 'fixed', background: 'var(--bg-asphalt)', overflowY: 'auto', zIndex: 1000 }}>
      <header className="topbar-float" style={{ position: 'sticky', background: 'var(--bg-asphalt)' }}>
        <div className="brand-row" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {status?.status === 'approved' && (
            <button className="admin-hamburger-btn" onClick={() => setMobileNavOpen((v) => !v)} aria-label="Menu" style={{ pointerEvents: 'auto' }}>☰</button>
          )}
          <span style={{ fontSize: 20 }}>🏛️</span>
          <span className="brand-name">{fr ? 'Portail municipal' : 'Municipal portal'}</span>
        </div>
        <button className="btn-ghost" onClick={onClose} style={{ pointerEvents: 'auto' }}>
          {fr ? '← Retour à la carte' : '← Back to map'}
        </button>
      </header>

      {loading && <div className="center-msg">{fr ? 'Chargement...' : 'Loading...'}</div>}

      {!loading && status?.status === 'none' && (
        <div style={{ maxWidth: 440, margin: '40px auto', padding: '0 24px' }}>
          <RequestAccessForm lang={lang} onSubmitted={() => setStatus({ status: 'pending' })} />
        </div>
      )}
      {!loading && status?.status === 'pending' && (
        <div style={{ maxWidth: 440, margin: '40px auto', padding: '0 24px' }}>
          <PendingScreen lang={lang} regionName={status.regionName} />
        </div>
      )}

      {!loading && status?.status === 'approved' && (
        <div className="admin-layout" style={{ maxWidth: 1500, margin: '0 auto', padding: '20px 24px 60px' }}>
          {mobileNavOpen && <div className="admin-sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />}
          <div className={`admin-sidebar ${mobileNavOpen ? 'mobile-open' : ''}`} style={{ width: 210, flexShrink: 0, position: 'sticky', top: 90 }}>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', padding: '0 10px 10px', fontWeight: 600 }}>{status.regionName}</div>
            {SIDEBAR_SECTIONS.map((section, i) => (
              <div key={i} style={{ marginBottom: 16 }}>
                {section.group && <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 10px', letterSpacing: 0.5, fontWeight: 600 }}>{section.group}</div>}
                {section.items.map((item) => (
                  <div
                    key={item.key}
                    onClick={() => { setTab(item.key); setMobileNavOpen(false); }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', borderRadius: 9, cursor: 'pointer', fontSize: 13,
                      background: tab === item.key ? 'var(--panel-hover)' : 'transparent',
                      color: tab === item.key ? 'var(--text-body)' : 'var(--text-muted)',
                      fontWeight: tab === item.key ? 600 : 400,
                      opacity: item.ready ? 1 : 0.6,
                    }}
                  >
                    <span style={{ width: 16, textAlign: 'center', flexShrink: 0 }}>{item.icon}</span>
                    {fr ? item.label.fr : item.label.en}
                  </div>
                ))}
              </div>
            ))}
          </div>

          <div style={{ flex: 1, minWidth: 0, maxWidth: 1100 }}>
            {tab === 'dashboard' && <DashboardView lang={lang} regionName={status.regionName} />}
            {tab === 'reports' && <ReportsListView lang={lang} />}
            {tab === 'settings' && <ReportSettingsView lang={lang} />}
            {['interventions', 'stats', 'comparatives', 'team'].includes(tab) && (
              <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-muted)', fontSize: 13 }}>
                {fr ? 'Bientôt disponible.' : 'Coming soon.'}
              </div>
            )}
          </div>
        </div>
      )}
    </div>,
    document.body,
  );
}


function RequestAccessForm({ lang, onSubmitted }: { lang: 'fr' | 'en'; onSubmitted: () => void }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [selectedRegion, setSelectedRegion] = useState<{ regionId: string; regionNameFr: string } | null>(null);
  const [jobTitle, setJobTitle] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fr = lang === 'fr';

  useEffect(() => {
    if (search.trim().length < 2 || selectedRegion) { setResults([]); return; }
    const timeout = setTimeout(() => {
      api.get<any[]>(`/municipal-portal/search-regions?search=${encodeURIComponent(search)}`).then(setResults).catch(() => {});
    }, 300);
    return () => clearTimeout(timeout);
  }, [search, selectedRegion]);

  async function submit() {
    if (!selectedRegion || !jobTitle.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await api.post('/municipal-portal/request-access', { regionId: selectedRegion.regionId, jobTitle, message: message || undefined });
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
        {fr
          ? "Tu représentes une municipalité et souhaites gérer ses signalements? Envoie une demande — notre équipe la validera avant de t'accorder l'accès."
          : "You represent a municipality and want to manage its reports? Send a request — our team will review it before granting access."}
      </p>
      {error && <div className="error-banner">{error}</div>}

      <div className="field-group" style={{ position: 'relative' }}>
        <label className="field-label">{fr ? 'Municipalité' : 'Municipality'}</label>
        {selectedRegion ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--panel-hover)', borderRadius: 8, padding: '8px 12px' }}>
            <span style={{ flex: 1, fontSize: 13.5 }}>{selectedRegion.regionNameFr}</span>
            <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => { setSelectedRegion(null); setSearch(''); }}>{fr ? 'Changer' : 'Change'}</button>
          </div>
        ) : (
          <input className="text-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={fr ? 'Chercher une municipalité...' : 'Search a municipality...'} />
        )}
        {!selectedRegion && results.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'var(--panel-solid)', border: '1px solid var(--panel-border)', borderRadius: 10, marginTop: 4, zIndex: 5, boxShadow: 'var(--shadow-panel)', overflow: 'hidden' }}>
            {results.map((r) => (
              <div key={r.regionId} className="search-dropdown-item" onClick={() => { setSelectedRegion(r); setResults([]); }}>
                {r.regionNameFr}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="field-group">
        <label className="field-label">{fr ? 'Ton poste' : 'Your position'}</label>
        <input className="text-input" value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder={fr ? 'Ex. Directeur des travaux publics' : 'E.g. Public works director'} />
      </div>

      <div className="field-group">
        <label className="field-label">{fr ? 'Message (optionnel)' : 'Message (optional)'}</label>
        <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>

      <button className="btn-primary" style={{ width: '100%' }} onClick={submit} disabled={submitting || !selectedRegion || !jobTitle.trim()}>
        {submitting ? (fr ? 'Envoi...' : 'Sending...') : (fr ? 'Envoyer la demande' : 'Send request')}
      </button>
    </>
  );
}

function PendingScreen({ lang, regionName }: { lang: 'fr' | 'en'; regionName?: string }) {
  const fr = lang === 'fr';
  return (
    <div style={{ textAlign: 'center', padding: '20px 0' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
      <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>
        {fr ? 'Demande en attente de validation' : 'Request pending review'}
      </div>
      <p style={{ fontSize: 12.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>
        {fr
          ? `Ta demande d'accès${regionName ? ` pour ${regionName}` : ''} a bien été reçue. Notre équipe la validera prochainement — tu recevras un courriel dès qu'elle sera traitée.`
          : `Your access request${regionName ? ` for ${regionName}` : ''} has been received. Our team will review it soon — you'll get an email once it's processed.`}
      </p>
    </div>
  );
}

const SIDEBAR_SECTIONS: { group: string; items: { key: string; icon: string; label: { fr: string; en: string }; ready: boolean }[] }[] = [
  { group: '', items: [{ key: 'dashboard', icon: '▦', label: { fr: 'Tableau de bord', en: 'Dashboard' }, ready: true }] },
  {
    group: 'SIGNALEMENTS',
    items: [{ key: 'reports', icon: '◉', label: { fr: 'Tous les signalements', en: 'All reports' }, ready: true }],
  },
  {
    group: 'OPÉRATIONS',
    items: [
      { key: 'interventions', icon: '▣', label: { fr: 'Interventions', en: 'Interventions' }, ready: false },
    ],
  },
  {
    group: 'ANALYSE',
    items: [
      { key: 'stats', icon: '▥', label: { fr: 'Statistiques', en: 'Statistics' }, ready: false },
      { key: 'comparatives', icon: '↗', label: { fr: 'Comparatifs', en: 'Comparatives' }, ready: false },
    ],
  },
  {
    group: 'ADMINISTRATION',
    items: [
      { key: 'team', icon: '♟', label: { fr: 'Équipe', en: 'Team' }, ready: false },
      { key: 'settings', icon: '⚙', label: { fr: 'Paramètres', en: 'Settings' }, ready: true },
    ],
  },
];


function DashboardView({ lang, regionName }: { lang: 'fr' | 'en'; regionName?: string }) {
  const [data, setData] = useState<any>(null);
  const fr = lang === 'fr';

  useEffect(() => {
    api.get<any>('/municipal-portal/my-region/dashboard').then(setData).catch(() => {});
  }, []);

  if (!data) return <div className="center-msg">{fr ? 'Chargement...' : 'Loading...'}</div>;

  const cards = [
    { key: 'new', icon: '🔴', label: fr ? 'Nouveaux' : 'New', value: data.counts.new },
    { key: 'acknowledged', icon: '🟠', label: fr ? 'Reconnus' : 'Acknowledged', value: data.counts.acknowledged },
    { key: 'inProgress', icon: '🟣', label: fr ? 'En cours' : 'In progress', value: data.counts.inProgress },
    { key: 'done', icon: '🔵', label: fr ? 'Complétés (interne)' : 'Done (internal)', value: data.counts.done },
    { key: 'resolved', icon: '🟢', label: fr ? 'Résolus' : 'Resolved', value: data.counts.resolved },
    { key: 'late', icon: '⏰', label: fr ? 'En retard' : 'Late', value: data.counts.late },
  ];

  return (
    <div>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>{fr ? `Bonjour, ${regionName}` : `Hello, ${regionName}`}</div>
      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginBottom: 18 }}>
        {fr ? "Voici l'état actuel de votre territoire." : "Here's the current state of your territory."}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
        {cards.map((c) => (
          <div key={c.key} style={{ background: 'var(--panel-hover)', borderRadius: 12, padding: '12px 10px', textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{c.icon} {c.value}</div>
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 20 }}>
        {data.summary.activeTotal} {fr ? 'signalements actifs' : 'active reports'}
        {data.summary.avgResolutionDays !== null && <> · {fr ? 'délai moyen' : 'avg time'} {data.summary.avgResolutionDays} {fr ? 'jours' : 'days'}</>}
        {data.summary.resolvedUnder7dPct !== null && <> · {data.summary.resolvedUnder7dPct}% {fr ? 'traités sous 7 jours' : 'handled under 7 days'}</>}
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px' }}>
          <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Signalements prioritaires' : 'Priority reports'}</div>
          {data.priority.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fr ? 'Aucun.' : 'None.'}</div>}
          {data.priority.map((p: any) => (
            <div key={p.id} style={{ fontSize: 12, padding: '6px 0', borderBottom: '1px solid var(--panel-border)' }}>
              {p.icon ?? '📍'} {p.typeName} — {p.addressText ?? '—'} <span style={{ color: 'var(--text-muted)' }}>({p.confirmationsCount} 👍)</span>
            </div>
          ))}
        </div>
        <div style={{ flex: '1 1 260px' }}>
          <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Activité récente' : 'Recent activity'}</div>
          {data.activity.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fr ? 'Aucune.' : 'None.'}</div>}
          {data.activity.map((a: any, i: number) => (
            <div key={i} style={{ fontSize: 11.5, padding: '5px 0', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)' }}>
              {new Date(a.updatedAt).toLocaleString(fr ? 'fr-CA' : 'en-CA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} — {a.addressText ?? '—'} ({a.internalStatus})
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReportsListView({ lang }: { lang: 'fr' | 'en' }) {
  const [groups, setGroups] = useState<any[]>([]);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'table' | 'grid' | 'map'>('list');
  const [sortBy, setSortBy] = useState<'lastReportedAt' | 'reportCount' | 'problemTypeNameFr'>('lastReportedAt');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const fr = lang === 'fr';

  const STATUS_FILTER_OPTIONS: { key: string; label: { fr: string; en: string } }[] = [
    { key: 'all', label: { fr: 'Tous les statuts', en: 'All statuses' } },
    { key: 'pending_moderation', label: { fr: 'En attente de modération', en: 'Pending moderation' } },
    { key: 'published_unresolved', label: { fr: 'Non résolu', en: 'Unresolved' } },
    { key: 'published_resolved', label: { fr: 'Résolu', en: 'Resolved' } },
    { key: 'rejected', label: { fr: 'Refusé', en: 'Rejected' } },
    { key: 'withdrawn', label: { fr: 'Retiré', en: 'Withdrawn' } },
    { key: 'archived', label: { fr: 'Archivé', en: 'Archived' } },
  ];

  function load() {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (statusFilter !== 'all') params.set('status', statusFilter);
    api.get<any[]>(`/municipal-portal/my-region/reports/queue?${params.toString()}`).then(setGroups).catch(() => {});
  }

  // Recherche/filtre appliqués CÔTÉ SERVEUR (voir findMyRegionReportsQueue)
  // — affecte directement quels signalements entrent dans le
  // regroupement en incidents, pas un simple masquage visuel après
  // coup qui laisserait les compteurs incohérents.
  useEffect(load, [statusFilter]);
  useEffect(() => {
    const timeout = setTimeout(load, 350);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  if (detailKey) {
    return <IncidentDetailScreen lang={lang} groupKey={detailKey} onBack={() => { setDetailKey(null); load(); }} />;
  }

  const sorted = [...groups].sort((a, b) => {
    if (sortBy === 'reportCount') return b.reportCount - a.reportCount;
    if (sortBy === 'problemTypeNameFr') return a.problemTypeNameFr.localeCompare(b.problemTypeNameFr);
    return new Date(b.lastReportedAt).getTime() - new Date(a.lastReportedAt).getTime();
  });

  const mapPins: MapPin[] = groups
    .filter((g) => g.lat && g.lng)
    .map((g) => ({
      id: g.groupKey,
      latitude: g.lat,
      longitude: g.lng,
      icon: g.problemTypeIcon ?? '📍',
      colorVar: 'unresolved',
      selected: detailKey === g.groupKey,
      onClick: () => setDetailKey(g.groupKey),
    }));
  const mapCenter = mapPins.length > 0 ? { lat: mapPins[0].latitude, lng: mapPins[0].longitude, zoom: 12 } : null;

  function statusBadge(status: string) {
    const map: Record<string, { icon: string; color: string; fr: string; en: string }> = {
      pending_moderation: { icon: '⏳', color: 'var(--official-blue)', fr: 'En attente', en: 'Pending' },
      published_unresolved: { icon: '🔴', color: 'var(--accent-signal)', fr: 'Non résolu', en: 'Unresolved' },
      published_resolved: { icon: '🟢', color: 'var(--status-resolved)', fr: 'Résolu', en: 'Resolved' },
      rejected: { icon: '✕', color: 'var(--text-muted)', fr: 'Refusé', en: 'Rejected' },
      withdrawn: { icon: '↩', color: 'var(--text-muted)', fr: 'Retiré', en: 'Withdrawn' },
      archived: { icon: '📦', color: 'var(--text-muted)', fr: 'Archivé', en: 'Archived' },
    };
    const s = map[status] ?? { icon: '•', color: 'var(--text-muted)', fr: status, en: status };
    return <span style={{ color: s.color, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{s.icon} {fr ? s.fr : s.en}</span>;
  }

  const VIEW_MODES: { key: typeof viewMode; icon: string; label: { fr: string; en: string } }[] = [
    { key: 'list', icon: '☰', label: { fr: 'Liste', en: 'List' } },
    { key: 'table', icon: '▤', label: { fr: 'Tableau', en: 'Table' } },
    { key: 'grid', icon: '▦', label: { fr: 'Grille', en: 'Grid' } },
    { key: 'map', icon: '⌖', label: { fr: 'Carte', en: 'Map' } },
  ];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Tous les signalements' : 'All reports'} ({groups.length} {fr ? 'incidents' : 'incidents'})</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {VIEW_MODES.map((v) => (
            <button
              key={v.key}
              className="btn-ghost"
              style={{ fontSize: 11.5, padding: '5px 10px', border: viewMode === v.key ? '1.5px solid var(--accent-signal)' : '1px solid var(--panel-border)' }}
              onClick={() => setViewMode(v.key)}
              title={fr ? v.label.fr : v.label.en}
            >
              {v.icon} {fr ? v.label.fr : v.label.en}
            </button>
          ))}
        </div>
      </div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
        {fr
          ? "Les signalements du même problème, proches les uns des autres, sont regroupés — clique pour voir les déclarations individuelles."
          : 'Reports of the same problem, close to each other, are grouped — click to see individual declarations.'}
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <input
          className="text-input"
          style={{ flex: '2 1 200px' }}
          placeholder={fr ? 'Rechercher par adresse ou description...' : 'Search by address or description...'}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ flex: '1 1 160px' }}>
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.key} value={o.key}>{fr ? o.label.fr : o.label.en}</option>
          ))}
        </select>
        <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} style={{ flex: '1 1 160px' }}>
          <option value="lastReportedAt">{fr ? 'Trier : plus récent' : 'Sort: most recent'}</option>
          <option value="reportCount">{fr ? 'Trier : nombre de signalements' : 'Sort: report count'}</option>
          <option value="problemTypeNameFr">{fr ? 'Trier : type' : 'Sort: type'}</option>
        </select>
      </div>

      {viewMode === 'list' && (
        <div>
          {sorted.map((g) => (
            <div key={g.groupKey}>
              <div
                onClick={() => setDetailKey(g.groupKey)}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: '1px solid var(--panel-border)', fontSize: 12.5, cursor: 'pointer' }}
              >
                {g.thumbnailUrl ? <img src={g.thumbnailUrl} alt="" style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 6, flexShrink: 0 }} /> : <div style={{ width: 44, height: 44, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--panel-hover)', borderRadius: 6 }}>{g.problemTypeIcon ?? '📍'}</div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{g.problemTypeIcon ?? '📍'} {g.problemTypeNameFr} — {g.addressText ?? '—'}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {statusBadge(g.status)}
                    {' · '}
                    {g.reportCount > 1
                      ? (fr ? `${g.reportCount} signalements citoyens` : `${g.reportCount} citizen reports`)
                      : (fr ? '1 signalement' : '1 report')}
                    {' · '}
                    {fr ? 'Premier' : 'First'} {new Date(g.firstReportedAt).toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short' })}
                    {g.reportCount > 1 && <> · {fr ? 'Dernier' : 'Last'} {new Date(g.lastReportedAt).toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short' })}</>}
                  </div>
                </div>
                {g.reportCount > 1 && (
                  <div style={{ background: 'var(--accent-signal)', color: '#14161B', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {g.reportCount}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewMode === 'table' && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--panel-border)', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px', cursor: 'pointer' }} onClick={() => setSortBy('problemTypeNameFr')}>{fr ? 'Type' : 'Type'}</th>
              <th style={{ padding: '6px 8px' }}>{fr ? 'Adresse' : 'Address'}</th>
              <th style={{ padding: '6px 8px' }}>{fr ? 'Statut' : 'Status'}</th>
              <th style={{ padding: '6px 8px', cursor: 'pointer', textAlign: 'right' }} onClick={() => setSortBy('reportCount')}>{fr ? 'Signalements' : 'Reports'}</th>
              <th style={{ padding: '6px 8px' }}>{fr ? 'Premier' : 'First'}</th>
              <th style={{ padding: '6px 8px', cursor: 'pointer' }} onClick={() => setSortBy('lastReportedAt')}>{fr ? 'Dernier' : 'Last'}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((g) => (
              <tr key={g.groupKey} onClick={() => setDetailKey(g.groupKey)} style={{ cursor: 'pointer', borderBottom: '1px solid var(--panel-border)' }}>
                <td style={{ padding: '7px 8px' }}>{g.problemTypeIcon ?? '📍'} {g.problemTypeNameFr}</td>
                <td style={{ padding: '7px 8px', color: 'var(--text-muted)' }}>{g.addressText ?? '—'}</td>
                <td style={{ padding: '7px 8px' }}>{statusBadge(g.status)}</td>
                <td style={{ padding: '7px 8px', textAlign: 'right', fontWeight: g.reportCount > 1 ? 700 : 400 }}>{g.reportCount}</td>
                <td style={{ padding: '7px 8px', color: 'var(--text-muted)' }}>{new Date(g.firstReportedAt).toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short' })}</td>
                <td style={{ padding: '7px 8px', color: 'var(--text-muted)' }}>{new Date(g.lastReportedAt).toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short' })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {viewMode === 'grid' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 10 }}>
          {sorted.map((g) => (
            <div key={g.groupKey} onClick={() => setDetailKey(g.groupKey)} style={{ background: 'var(--panel-hover)', borderRadius: 10, overflow: 'hidden', cursor: 'pointer', border: detailKey === g.groupKey ? '1.5px solid var(--accent-signal)' : '1px solid transparent' }}>
              {g.thumbnailUrl
                ? <img src={g.thumbnailUrl} alt="" style={{ width: '100%', height: 90, objectFit: 'cover' }} />
                : <div style={{ width: '100%', height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28, background: 'var(--panel)' }}>{g.problemTypeIcon ?? '📍'}</div>}
              <div style={{ padding: 8 }}>
                <div style={{ fontSize: 11.5, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.problemTypeNameFr}</div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.addressText ?? '—'}</div>
                {g.reportCount > 1 && <div style={{ fontSize: 10.5, color: 'var(--accent-signal)', fontWeight: 700, marginTop: 2 }}>{g.reportCount} {fr ? 'signalements' : 'reports'}</div>}
              </div>
            </div>
          ))}
        </div>
      )}

      {viewMode === 'map' && (
        <div style={{ borderRadius: 10, overflow: 'hidden' }}>
          <MapView center={mapCenter} pins={mapPins} height={480} theme="dark" />
        </div>
      )}
    </div>
  );
}

function ReportSettingsView({ lang }: { lang: 'fr' | 'en' }) {
  const fr = lang === 'fr';
  const [reportSettings, setReportSettings] = useState<{ enabled: boolean; frequency: 'weekly' | 'monthly'; enabled_stats: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const STAT_LABELS: Record<string, string> = {
    active_by_type: fr ? 'Signalements actifs par type' : 'Active reports by type',
    resolved_period: fr ? 'Résolus durant la période' : 'Resolved during period',
    new_period: fr ? 'Nouveaux durant la période' : 'New during period',
    removed_period: fr ? 'Retirés durant la période' : 'Removed during period',
    ranking: fr ? 'Classement TOP 100 vs autres municipalités' : 'TOP 100 ranking vs other municipalities',
    resolution_performance: fr ? 'Taux et temps moyen de résolution' : 'Resolution rate and avg time',
    problematic_zones: fr ? 'Zones routières les plus problématiques' : 'Most problematic road zones',
    most_confirmed: fr ? 'Signalements les plus confirmés ("Présent")' : 'Most confirmed reports ("Present")',
  };

  useEffect(() => {
    api.get<any>('/municipal-portal/my-region/report/settings').then(setReportSettings).catch(() => {});
  }, []);

  function toggleStat(key: string) {
    setReportSettings((prev) => {
      if (!prev) return prev;
      const has = prev.enabled_stats.includes(key);
      return { ...prev, enabled_stats: has ? prev.enabled_stats.filter((k) => k !== key) : [...prev.enabled_stats, key] };
    });
  }

  async function save() {
    if (!reportSettings) return;
    setSaving(true);
    setFeedback(null);
    try {
      await api.patch('/municipal-portal/my-region/report/settings', reportSettings);
      setFeedback(fr ? 'Enregistré.' : 'Saved.');
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  }

  if (!reportSettings) return <div className="center-msg">{fr ? 'Chargement...' : 'Loading...'}</div>;

  return (
    <div>
      <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Rapport périodique' : 'Periodic report'}</div>
      <div className="privacy-row">
        <span>{fr ? 'Activer le rapport périodique' : 'Enable periodic report'}</span>
        <input type="checkbox" checked={reportSettings.enabled} onChange={() => setReportSettings((s) => (s ? { ...s, enabled: !s.enabled } : s))} />
      </div>
      {reportSettings.enabled && (
        <>
          <div className="field-group" style={{ marginTop: 12 }}>
            <label className="field-label">{fr ? "Fréquence d'envoi" : 'Frequency'}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="btn-ghost" style={{ flex: 1, border: reportSettings.frequency === 'weekly' ? '1.5px solid var(--accent-signal)' : '1px solid var(--panel-border)' }} onClick={() => setReportSettings((s) => (s ? { ...s, frequency: 'weekly' } : s))}>
                {fr ? 'Hebdomadaire' : 'Weekly'}
              </button>
              <button className="btn-ghost" style={{ flex: 1, border: reportSettings.frequency === 'monthly' ? '1.5px solid var(--accent-signal)' : '1px solid var(--panel-border)' }} onClick={() => setReportSettings((s) => (s ? { ...s, frequency: 'monthly' } : s))}>
                {fr ? 'Mensuelle' : 'Monthly'}
              </button>
            </div>
          </div>
          <div className="field-group">
            <label className="field-label">{fr ? 'Statistiques affichées' : 'Displayed statistics'}</label>
            {Object.entries(STAT_LABELS).map(([key, label]) => (
              <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', cursor: 'pointer', fontSize: 12.5 }}>
                <input type="checkbox" checked={reportSettings.enabled_stats.includes(key)} onChange={() => toggleStat(key)} />
                {label}
              </label>
            ))}
          </div>
        </>
      )}
      <button className="btn-primary" onClick={save} disabled={saving} style={{ marginTop: 4 }}>
        {saving ? (fr ? 'Enregistrement...' : 'Saving...') : (fr ? 'Enregistrer' : 'Save')}
      </button>
      {feedback && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{feedback}</div>}
    </div>
  );
}

const INTERNAL_STATUS_OPTIONS: { key: 'new' | 'acknowledged' | 'in_progress' | 'done'; icon: string; label: { fr: string; en: string } }[] = [
  { key: 'new', icon: '🔴', label: { fr: 'Nouveau', en: 'New' } },
  { key: 'acknowledged', icon: '🟠', label: { fr: 'Reconnu', en: 'Acknowledged' } },
  { key: 'in_progress', icon: '🟣', label: { fr: 'En cours', en: 'In progress' } },
  { key: 'done', icon: '🔵', label: { fr: 'Complété', en: 'Done' } },
];

/** Fiche détaillée d'un incident — galerie photo, statut interne,
 * assignation, notes, et ligne du temps. Remplace le petit dépliage
 * précédent, devenu insuffisant une fois qu'on veut vraiment gérer un
 * incident (pas juste voir la liste des signalements qui le
 * composent). */
function IncidentDetailScreen({ lang, groupKey, onBack }: { lang: 'fr' | 'en'; groupKey: string; onBack: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [notes, setNotes] = useState('');
  const [assignedTo, setAssignedTo] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDescription, setEditDescription] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [publicNote, setPublicNote] = useState('');
  const [publicNoteVisible, setPublicNoteVisible] = useState(false);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [publicStatusSaving, setPublicStatusSaving] = useState(false);
  const fr = lang === 'fr';

  function load() {
    api.get<any>(`/municipal-portal/my-region/incidents/${groupKey}/detail`).then((d) => {
      setDetail(d);
      setNotes(d.internalNotes ?? '');
      setAssignedTo(d.assignedTo ?? '');
      setEditDescription(d.description ?? '');
      setEditAddress(d.addressText ?? '');
    }).catch(() => {});
  }

  useEffect(load, [groupKey]);

  function selectStatus(status: string) {
    setPendingStatus(status);
    setPublicNote('');
    setPublicNoteVisible(false);
  }

  async function confirmStatusChange() {
    if (!pendingStatus) return;
    setPublicStatusSaving(true);
    try {
      await api.patch(`/municipal-portal/my-region/incidents/${groupKey}/tracking`, {
        internalStatus: pendingStatus,
        ...(publicNote.trim() && { publicNote: publicNote.trim(), publicNoteVisible }),
      });
      setPendingStatus(null);
      load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setPublicStatusSaving(false);
    }
  }

  async function saveEdit() {
    setSaving(true);
    setFeedback(null);
    try {
      await api.patch(`/municipal-portal/my-region/incidents/${groupKey}/report`, { description: editDescription, addressText: editAddress });
      setEditing(false);
      setFeedback(fr ? 'Enregistré.' : 'Saved.');
      load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  }

  async function setPublicStatus(status: 'published_unresolved' | 'published_resolved') {
    setSaving(true);
    try {
      await api.patch(`/municipal-portal/my-region/incidents/${groupKey}/public-status`, { status });
      load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  }

  async function saveAssignmentAndNotes() {
    setSaving(true);
    setFeedback(null);
    try {
      await api.patch(`/municipal-portal/my-region/incidents/${groupKey}/tracking`, { assignedTo: assignedTo || undefined, internalNotes: notes || undefined });
      setFeedback(fr ? 'Enregistré.' : 'Saved.');
      load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  }

  if (!detail) return <div className="center-msg">{fr ? 'Chargement...' : 'Loading...'}</div>;

  return (
    <div>
      <button className="btn-ghost" style={{ marginBottom: 14, fontSize: 12.5 }} onClick={onBack}>← {fr ? 'Retour à la liste' : 'Back to list'}</button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>{detail.problemTypeIcon ?? '📍'}</span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{detail.problemTypeNameFr}</div>
            {!editing && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{detail.addressText ?? '—'}</div>}
          </div>
        </div>
        {!editing && <button className="btn-ghost" style={{ fontSize: 11.5 }} onClick={() => setEditing(true)}>✏️ {fr ? 'Modifier' : 'Edit'}</button>}
      </div>

      {editing && (
        <div style={{ background: 'var(--panel-hover)', borderRadius: 10, padding: 14, marginTop: 10, marginBottom: 16 }}>
          <div className="field-group">
            <label className="field-label">{fr ? 'Adresse' : 'Address'}</label>
            <input className="text-input" value={editAddress} onChange={(e) => setEditAddress(e.target.value)} />
          </div>
          <div className="field-group">
            <label className="field-label">{fr ? 'Description' : 'Description'}</label>
            <textarea rows={3} value={editDescription} onChange={(e) => setEditDescription(e.target.value)} />
          </div>
          <div className="action-row">
            <button className="btn-primary" onClick={saveEdit} disabled={saving}>{saving ? (fr ? 'Enregistrement...' : 'Saving...') : (fr ? 'Enregistrer' : 'Save')}</button>
            <button className="btn-ghost" onClick={() => { setEditing(false); setEditDescription(detail.description ?? ''); setEditAddress(detail.addressText ?? ''); }}>{fr ? 'Annuler' : 'Cancel'}</button>
          </div>
        </div>
      )}

      <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 20 }}>
        {detail.reportCount > 1
          ? (fr ? `${detail.reportCount} signalements citoyens regroupés` : `${detail.reportCount} grouped citizen reports`)
          : (fr ? '1 signalement' : '1 report')}
      </div>

      <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Statut public (visible sur la carte)' : 'Public status (visible on the map)'}</div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        <button className="btn-ghost" style={{ fontSize: 12, border: detail.status === 'published_unresolved' ? '1.5px solid var(--accent-signal)' : '1px solid var(--panel-border)' }} onClick={() => setPublicStatus('published_unresolved')} disabled={saving}>
          🔴 {fr ? 'Non résolu' : 'Unresolved'}
        </button>
        <button className="btn-ghost" style={{ fontSize: 12, border: detail.status === 'published_resolved' ? '1.5px solid var(--accent-signal)' : '1px solid var(--panel-border)' }} onClick={() => setPublicStatus('published_resolved')} disabled={saving}>
          🟢 {fr ? 'Résolu' : 'Resolved'}
        </button>
      </div>

      <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Statut interne (suivi de l\'équipe)' : 'Internal status (team tracking)'}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {INTERNAL_STATUS_OPTIONS.map((s) => (
          <button
            key={s.key}
            className="btn-ghost"
            style={{ fontSize: 12, border: (pendingStatus ?? detail.internalStatus) === s.key ? '1.5px solid var(--accent-signal)' : '1px solid var(--panel-border)' }}
            onClick={() => selectStatus(s.key)}
          >
            {s.icon} {fr ? s.label.fr : s.label.en}
          </button>
        ))}
      </div>
      {pendingStatus && (
        <div style={{ background: 'var(--panel-hover)', borderRadius: 10, padding: 12, marginBottom: 20 }}>
          <div className="field-group" style={{ marginBottom: 8 }}>
            <label className="field-label">{fr ? 'Note sur ce changement (optionnel)' : 'Note about this change (optional)'}</label>
            <textarea rows={2} value={publicNote} onChange={(e) => setPublicNote(e.target.value)} placeholder={fr ? 'Ex. Réparation prévue mardi prochain' : 'E.g. Repair scheduled for next Tuesday'} />
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, marginBottom: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={publicNoteVisible} onChange={(e) => setPublicNoteVisible(e.target.checked)} disabled={!publicNote.trim()} />
            👁️ {fr ? 'Rendre cette note visible aux citoyens sur la fiche du signalement' : 'Make this note visible to citizens on the report page'}
          </label>
          <div className="action-row">
            <button className="btn-primary" onClick={confirmStatusChange} disabled={publicStatusSaving}>
              {publicStatusSaving ? (fr ? 'Enregistrement...' : 'Saving...') : (fr ? 'Confirmer le changement' : 'Confirm change')}
            </button>
            <button className="btn-ghost" onClick={() => setPendingStatus(null)}>{fr ? 'Annuler' : 'Cancel'}</button>
          </div>
        </div>
      )}
      {feedback && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>{feedback}</div>}

      {detail.photos.length > 0 && (
        <>
          <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Photos' : 'Photos'} ({detail.photos.length})</div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            {detail.photos.map((p: any) => (
              <img key={p.id} src={p.url} alt="" style={{ width: 100, height: 100, objectFit: 'cover', borderRadius: 8 }} />
            ))}
          </div>
        </>
      )}

      <div className="field-group">
        <label className="field-label">{fr ? 'Assigné à' : 'Assigned to'}</label>
        <input className="text-input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder={fr ? 'Nom de la personne ou de l\'équipe' : 'Name of person or team'} />
      </div>
      <div className="field-group">
        <label className="field-label">{fr ? 'Notes internes' : 'Internal notes'}</label>
        <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <button className="btn-primary" onClick={saveAssignmentAndNotes} disabled={saving}>
        {saving ? (fr ? 'Enregistrement...' : 'Saving...') : (fr ? 'Enregistrer' : 'Save')}
      </button>
      {feedback && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 6 }}>{feedback}</div>}

      <div className="section-label">{fr ? 'Ligne du temps' : 'Timeline'}</div>
      <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 10 }}>
        {fr
          ? "Chaque soumission citoyenne et chaque changement de statut, conservés pour toujours."
          : 'Every citizen submission and every status change, kept forever.'}
      </p>
      {detail.timeline.map((event: any, i: number) => (
        <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 0', borderLeft: '2px solid var(--panel-border)', paddingLeft: 12, marginLeft: 4 }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', flexShrink: 0, width: 90 }}>
            {new Date(event.at).toLocaleString(fr ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
          </div>
          <div style={{ fontSize: 12 }}>
            {event.type === 'submission' ? (
              fr ? <>📩 Signalement reçu{event.description ? ` — ${event.description}` : ''}</> : <>📩 Report received{event.description ? ` — ${event.description}` : ''}</>
            ) : (
              <>
                {fr
                  ? <>🔧 Statut : <strong>{INTERNAL_STATUS_OPTIONS.find((s) => s.key === event.status)?.label.fr ?? event.status}</strong>{event.by ? ` (par ${event.by})` : ''}</>
                  : <>🔧 Status: <strong>{INTERNAL_STATUS_OPTIONS.find((s) => s.key === event.status)?.label.en ?? event.status}</strong>{event.by ? ` (by ${event.by})` : ''}</>}
                {event.note && (
                  <div style={{ marginTop: 2, color: 'var(--text-muted)' }}>
                    {event.visibleToPublic ? '👁️ ' : '🔒 '}{event.note}
                    <span style={{ fontSize: 10 }}> — {event.visibleToPublic ? (fr ? 'visible aux citoyens' : 'visible to citizens') : (fr ? 'note interne' : 'internal note')}</span>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
