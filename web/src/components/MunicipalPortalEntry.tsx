import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';
import MapView, { MapPin } from './MapView';
import CustomSelect from './CustomSelect';

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
  const [permissions, setPermissions] = useState<Record<string, boolean> | null>(null);
  // Cible de navigation croisée — permet à une section (ex. la file
  // "À traiter" du tableau de bord) d'ouvrir directement une fiche
  // détaillée qui vit dans une AUTRE section (Tous les signalements /
  // Interventions), sans que ces sections ne se connaissent
  // directement entre elles.
  const [pendingNavTarget, setPendingNavTarget] = useState<{ type: 'incident' | 'work_order'; groupKey: string } | null>(null);
  const fr = lang === 'fr';

  useEffect(() => {
    api.get<any>('/municipal-portal/my-access-status')
      .then((s) => {
        setStatus(s);
        if (s.status === 'approved') {
          // Vraie vérification serveur des permissions par rang —
          // détermine quelles sections apparaissent réellement dans la
          // navigation, pas seulement une liste figée pour tous.
          api.get<Record<string, boolean>>('/municipal-portal/my-effective-permissions').then(setPermissions).catch(() => {});
        }
      })
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
            {SIDEBAR_SECTIONS.map((section, i) => {
              // Filtre selon les permissions réelles du rang — un item
              // reste visible tant que les permissions ne sont pas
              // encore chargées (évite un flash vide au chargement), le
              // vrai contrôle d'accès se fait de toute façon côté
              // serveur sur chaque route, pas seulement ici.
              const visibleItems = section.items.filter((item) => !permissions || permissions[item.permissionKey]);
              if (visibleItems.length === 0) return null;
              return (
                <div key={i} style={{ marginBottom: 16 }}>
                  {section.group && <div style={{ fontSize: 10, color: 'var(--text-muted)', padding: '4px 10px', letterSpacing: 0.5, fontWeight: 600 }}>{section.group}</div>}
                  {visibleItems.map((item) => (
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
              );
            })}
          </div>

          <div style={{ flex: 1, minWidth: 0, maxWidth: 1100 }}>
            {tab === 'dashboard' && <DashboardView lang={lang} regionName={status.regionName} onNavigateToItem={(type, groupKey) => { setPendingNavTarget({ type, groupKey }); setTab(type === 'incident' ? 'reports' : 'interventions'); }} />}
            {tab === 'reports' && <ReportsListView lang={lang} pendingNavTarget={tab === 'reports' ? pendingNavTarget : null} onNavTargetConsumed={() => setPendingNavTarget(null)} />}
            {tab === 'settings' && <ReportSettingsView lang={lang} />}
            {tab === 'stats' && <StatsView lang={lang} />}
            {tab === 'team' && <TeamView lang={lang} />}
            {tab === 'comparatives' && <ComparativesView lang={lang} />}
            {tab === 'interventions' && <WorkOrdersListView lang={lang} pendingNavTarget={tab === 'interventions' ? pendingNavTarget : null} onNavTargetConsumed={() => setPendingNavTarget(null)} />}
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

const SIDEBAR_SECTIONS: { group: string; items: { key: string; icon: string; label: { fr: string; en: string }; ready: boolean; permissionKey: string }[] }[] = [
  { group: '', items: [{ key: 'dashboard', icon: '▦', label: { fr: 'Tableau de bord', en: 'Dashboard' }, ready: true, permissionKey: 'can_view_dashboard' }] },
  {
    group: 'SIGNALEMENTS',
    items: [{ key: 'reports', icon: '◉', label: { fr: 'Tous les signalements', en: 'All reports' }, ready: true, permissionKey: 'can_view_reports' }],
  },
  {
    group: 'OPÉRATIONS',
    items: [
      { key: 'interventions', icon: '▣', label: { fr: 'Interventions', en: 'Interventions' }, ready: true, permissionKey: 'can_view_reports' },
    ],
  },
  {
    group: 'ANALYSE',
    items: [
      { key: 'stats', icon: '▥', label: { fr: 'Statistiques', en: 'Statistics' }, ready: true, permissionKey: 'can_view_stats' },
      { key: 'comparatives', icon: '↗', label: { fr: 'Comparatifs', en: 'Comparatives' }, ready: true, permissionKey: 'can_view_comparatives' },
    ],
  },
  {
    group: 'ADMINISTRATION',
    items: [
      { key: 'team', icon: '♟', label: { fr: 'Équipe', en: 'Team' }, ready: true, permissionKey: 'can_manage_team' },
      { key: 'settings', icon: '⚙', label: { fr: 'Paramètres', en: 'Settings' }, ready: true, permissionKey: 'can_manage_settings' },
    ],
  },
];


function DashboardView({ lang, regionName, onNavigateToItem }: { lang: 'fr' | 'en'; regionName?: string; onNavigateToItem: (type: 'incident' | 'work_order', groupKey: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [toProcess, setToProcess] = useState<any[]>([]);
  const fr = lang === 'fr';

  useEffect(() => {
    api.get<any>('/municipal-portal/my-region/dashboard').then(setData).catch(() => {});
    api.get<any[]>('/municipal-portal/my-region/to-process').then(setToProcess).catch(() => {});
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

      {toProcess.length > 0 && (
        <div style={{ background: 'var(--accent-signal-dim)', border: '1px solid var(--accent-signal)', borderRadius: 12, padding: 14, marginBottom: 20 }}>
          <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            ⚡ {fr ? 'À traiter' : 'To process'} ({toProcess.length})
          </div>
          <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 10 }}>
            {fr
              ? "Seulement ce qui nécessite vraiment ton attention, avec la raison précise — un même dossier peut apparaître pour plusieurs raisons."
              : 'Only what genuinely needs your attention, with the specific reason — a single case may appear for several reasons.'}
          </p>
          {toProcess.slice(0, 8).map((item: any, i: number) => (
            <div
              key={i}
              onClick={() => onNavigateToItem(item.type, item.groupKey)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0', borderBottom: i < toProcess.length - 1 ? '1px solid rgba(255,255,255,0.08)' : 'none', fontSize: 11.5, cursor: 'pointer' }}
            >
              <span>{item.problemTypeIcon ?? '📍'}</span>
              <span style={{ flex: 1 }}>
                {item.problemTypeNameFr} — {item.addressText ?? '—'}
                {item.caseNumber && <span style={{ color: 'var(--text-muted)' }}> · {item.caseNumber}</span>}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--accent-signal)' }}>{fr ? item.reasonLabel.fr : item.reasonLabel.en}</span>
            </div>
          ))}
          {toProcess.length > 8 && (
            <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 6 }}>
              {fr ? `+ ${toProcess.length - 8} autre(s) — voir Tous les signalements et Interventions.` : `+ ${toProcess.length - 8} more — see All reports and Interventions.`}
            </div>
          )}
        </div>
      )}

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

function ReportsListView({ lang, pendingNavTarget, onNavTargetConsumed }: { lang: 'fr' | 'en'; pendingNavTarget?: { type: 'incident' | 'work_order'; groupKey: string } | null; onNavTargetConsumed?: () => void }) {
  const [groups, setGroups] = useState<any[]>([]);
  const [detailKey, setDetailKey] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'table' | 'grid' | 'map'>('list');
  const [sortBy, setSortBy] = useState<'lastReportedAt' | 'reportCount' | 'problemTypeNameFr'>('lastReportedAt');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const fr = lang === 'fr';

  // Navigation croisée depuis une autre section (ex. la file "À
  // traiter" du tableau de bord) — ouvre directement cette fiche, puis
  // signale au parent que la cible a été consommée pour ne pas
  // rouvrir la même fiche indéfiniment.
  useEffect(() => {
    if (pendingNavTarget?.type === 'incident') {
      setDetailKey(pendingNavTarget.groupKey);
      onNavTargetConsumed?.();
    }
  }, [pendingNavTarget]);

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

  function priorityBadge(priority: string) {
    const map: Record<string, { icon: string; color: string; fr: string; en: string }> = {
      low: { icon: '🔵', color: 'var(--text-muted)', fr: 'Basse', en: 'Low' },
      medium: { icon: '🟡', color: '#D4A017', fr: 'Moyenne', en: 'Medium' },
      high: { icon: '🟠', color: '#E8730C', fr: 'Haute', en: 'High' },
      urgent: { icon: '🔴', color: 'var(--accent-signal)', fr: 'Urgente', en: 'Urgent' },
    };
    const p = map[priority] ?? map.medium;
    return <span style={{ color: p.color, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{p.icon} {fr ? p.fr : p.en}</span>;
  }

  function slaBadge(sla: { acknowledgment: string; resolution: string } | undefined) {
    if (!sla) return null;
    const worst = sla.resolution === 'late' || sla.acknowledgment === 'late' ? 'late'
      : sla.resolution === 'at_risk' || sla.acknowledgment === 'at_risk' ? 'at_risk'
      : sla.resolution === 'done' ? 'done' : 'on_time';
    const map: Record<string, { icon: string; color: string; fr: string; en: string }> = {
      on_time: { icon: '✅', color: 'var(--status-resolved)', fr: 'Dans les délais', en: 'On time' },
      at_risk: { icon: '⚠️', color: '#E8730C', fr: 'À risque', en: 'At risk' },
      late: { icon: '⏰', color: 'var(--accent-signal)', fr: 'En retard', en: 'Late' },
      done: { icon: '✔️', color: 'var(--status-resolved)', fr: 'Complété', en: 'Done' },
    };
    const w = map[worst];
    return <span style={{ color: w.color, fontSize: 11, fontWeight: 600, whiteSpace: 'nowrap' }}>{w.icon} {fr ? w.fr : w.en}</span>;
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
        <CustomSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={STATUS_FILTER_OPTIONS.map((o) => ({ value: o.key, label: fr ? o.label.fr : o.label.en }))}
          style={{ flex: '1 1 160px' }}
        />
        <CustomSelect
          value={sortBy}
          onChange={(v) => setSortBy(v as any)}
          options={[
            { value: 'lastReportedAt', label: fr ? 'Trier : plus récent' : 'Sort: most recent' },
            { value: 'reportCount', label: fr ? 'Trier : nombre de signalements' : 'Sort: report count' },
            { value: 'problemTypeNameFr', label: fr ? 'Trier : type' : 'Sort: type' },
          ]}
          style={{ flex: '1 1 160px' }}
        />
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
                  <div style={{ fontWeight: 600 }}>{g.problemTypeIcon ?? '📍'} {g.problemTypeNameFr} — {g.addressText ?? '—'}{g.caseNumber && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}> · {g.caseNumber}</span>}</div>
                  <div style={{ color: 'var(--text-muted)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    {statusBadge(g.status)}
                    {' · '}
                    {priorityBadge(g.priority)}
                    {' · '}
                    {slaBadge(g.sla)}
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
              <th style={{ padding: '6px 8px' }}>{fr ? 'Priorité' : 'Priority'}</th>
              <th style={{ padding: '6px 8px' }}>{fr ? 'SLA' : 'SLA'}</th>
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
                <td style={{ padding: '7px 8px' }}>{priorityBadge(g.priority)}</td>
                <td style={{ padding: '7px 8px' }}>{slaBadge(g.sla)}</td>
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

function StatsView({ lang }: { lang: 'fr' | 'en' }) {
  const [stats, setStats] = useState<any>(null);
  const [days, setDays] = useState(30);
  const fr = lang === 'fr';

  useEffect(() => {
    api.get<any>(`/municipal-portal/my-region/report/stats?days=${days}`).then(setStats).catch(() => {});
  }, [days]);

  if (!stats) return <div className="center-msg">{fr ? 'Chargement...' : 'Loading...'}</div>;

  const DAY_OPTIONS = [7, 30, 90, 365];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
        <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Statistiques' : 'Statistics'}</div>
        <div style={{ display: 'flex', gap: 4 }}>
          {DAY_OPTIONS.map((d) => (
            <button
              key={d}
              className="btn-ghost"
              style={{ fontSize: 11.5, padding: '5px 10px', border: days === d ? '1.5px solid var(--accent-signal)' : '1px solid var(--panel-border)' }}
              onClick={() => setDays(d)}
            >
              {d === 7 ? (fr ? '7 jours' : '7 days') : d === 30 ? (fr ? '30 jours' : '30 days') : d === 90 ? (fr ? '90 jours' : '90 days') : (fr ? '1 an' : '1 year')}
            </button>
          ))}
        </div>
      </div>

      {/* Activité de la période */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 24 }}>
        <div style={{ background: 'var(--panel-hover)', borderRadius: 12, padding: '14px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{stats.newPeriod}</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{fr ? 'Nouveaux' : 'New'}</div>
        </div>
        <div style={{ background: 'var(--panel-hover)', borderRadius: 12, padding: '14px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--status-resolved)' }}>{stats.resolvedPeriod}</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{fr ? 'Résolus' : 'Resolved'}</div>
        </div>
        <div style={{ background: 'var(--panel-hover)', borderRadius: 12, padding: '14px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-muted)' }}>{stats.removedPeriod}</div>
          <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>{fr ? 'Retirés' : 'Removed'}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
        <div style={{ flex: '1 1 260px' }}>
          <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Actifs par type' : 'Active by type'}</div>
          {stats.activeByType.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fr ? 'Aucun.' : 'None.'}</div>}
          {stats.activeByType.map((t: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, padding: '5px 0', borderBottom: '1px solid var(--panel-border)' }}>
              <span>{t.icon ?? '📍'} {t.typeName}</span>
              <strong>{t.count}</strong>
            </div>
          ))}
        </div>

        <div style={{ flex: '1 1 260px' }}>
          <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Performance de résolution' : 'Resolution performance'}</div>
          <div style={{ fontSize: 13, marginBottom: 6 }}>
            {fr ? 'Taux de résolution : ' : 'Resolution rate: '}
            <strong>{stats.resolutionPerformance.rate !== null ? `${stats.resolutionPerformance.rate}%` : (fr ? 'N/D' : 'N/A')}</strong>
          </div>
          <div style={{ fontSize: 13, marginBottom: 12 }}>
            {fr ? 'Temps moyen : ' : 'Average time: '}
            <strong>{stats.resolutionPerformance.avgResolutionDays !== null ? `${stats.resolutionPerformance.avgResolutionDays} ${fr ? 'jours' : 'days'}` : (fr ? 'N/D' : 'N/A')}</strong>
          </div>
          <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Classement (TOP 100)' : 'Ranking (TOP 100)'}</div>
          {stats.ranking.myRank ? (
            <div style={{ fontSize: 13 }}>
              {fr ? 'Rang ' : 'Rank '}<strong>{stats.ranking.myRank}</strong>{fr ? ' sur ' : ' of '}{stats.ranking.totalRanked}
              <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginTop: 2 }}>
                {fr ? 'Plus de signalements actifs = rang moins bon' : 'More active reports = worse rank'}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fr ? 'Pas assez de signalements pour figurer au classement.' : 'Not enough reports to rank.'}</div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px' }}>
          <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Zones routières les plus problématiques' : 'Most problematic road zones'}</div>
          {stats.problematicZones.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fr ? 'Aucune.' : 'None.'}</div>}
          {stats.problematicZones.slice(0, 8).map((z: any, i: number) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--panel-border)' }}>
              <span>{z.civicRange ? `${z.civicRange} ${z.streetName}` : z.streetName}</span>
              <strong>{z.count}</strong>
            </div>
          ))}
        </div>
        <div style={{ flex: '1 1 260px' }}>
          <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Plus confirmés ("Présent")' : 'Most confirmed ("Present")'}</div>
          {stats.mostConfirmed.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fr ? 'Aucun.' : 'None.'}</div>}
          {stats.mostConfirmed.slice(0, 8).map((r: any) => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--panel-border)' }}>
              <span>{r.icon ?? '📍'} {r.addressText ?? '—'}</span>
              <strong>👍 {r.confirmationsCount}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ComparativesView({ lang }: { lang: 'fr' | 'en' }) {
  const [data, setData] = useState<any>(null);
  const fr = lang === 'fr';

  useEffect(() => {
    api.get<any>('/municipal-portal/my-region/comparatives').then(setData).catch(() => {});
  }, []);

  if (!data) return <div className="center-msg">{fr ? 'Chargement...' : 'Loading...'}</div>;

  return (
    <div>
      <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Comparatifs' : 'Comparatives'}</div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16, lineHeight: 1.5 }}>
        {fr
          ? "Signalements actifs par 1000 habitants — pas un simple compte brut, qui pénaliserait injustement les grandes villes ayant naturellement plus de signalements que les petits villages."
          : 'Active reports per 1,000 residents — not a raw count, which would unfairly penalize big cities that naturally have more reports than small villages.'}
      </p>

      {!data.hasPopulation ? (
        <div style={{ background: 'var(--panel-hover)', borderRadius: 10, padding: 14, fontSize: 12.5, marginBottom: 20, lineHeight: 1.5 }}>
          {fr
            ? "La population de ta municipalité n'est pas encore connue — impossible de calculer ton taux normalisé. Demande à un admin du site de la renseigner (section Municipalités de l'administration)."
            : "Your municipality's population isn't known yet — can't compute your normalized rate. Ask a site admin to fill it in (Municipalities section of the admin)."}
        </div>
      ) : (
        <div style={{ background: 'var(--panel-hover)', borderRadius: 10, padding: 14, marginBottom: 20 }}>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{data.myEntry.ratePer1000}</div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6 }}>{fr ? 'signalements actifs / 1000 habitants' : 'active reports / 1,000 residents'}</div>
          <div style={{ fontSize: 12.5 }}>
            {fr ? 'Rang ' : 'Rank '}<strong>{data.myRank}</strong>{fr ? ' sur ' : ' of '}{data.totalRanked}
            <span style={{ color: 'var(--text-muted)' }}> ({fr ? 'meilleur = moins de signalements par habitant' : 'better = fewer reports per resident'})</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 260px' }}>
          <div className="section-label" style={{ marginTop: 0 }}>{fr ? '🟢 Meilleurs taux' : '🟢 Best rates'}</div>
          {data.best10.map((r: any, i: number) => (
            <div key={r.regionId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--panel-border)', fontWeight: r.regionId === data.myEntry?.regionId ? 700 : 400 }}>
              <span>{i + 1}. {r.regionName}</span>
              <strong>{r.ratePer1000}</strong>
            </div>
          ))}
        </div>
        <div style={{ flex: '1 1 260px' }}>
          <div className="section-label" style={{ marginTop: 0 }}>{fr ? '🔴 Taux les plus élevés' : '🔴 Highest rates'}</div>
          {data.worst10.map((r: any, i: number) => (
            <div key={r.regionId} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '5px 0', borderBottom: '1px solid var(--panel-border)', fontWeight: r.regionId === data.myEntry?.regionId ? 700 : 400 }}>
              <span>{i + 1}. {r.regionName}</span>
              <strong>{r.ratePer1000}</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const RANK_LABELS: Record<string, { fr: string; en: string; icon: string }> = {
  director: { fr: 'Directeur', en: 'Director', icon: '⭐' },
  foreman: { fr: 'Contremaître', en: 'Foreman', icon: '🔶' },
  employee: { fr: 'Employé', en: 'Employee', icon: '🔹' },
};
const RANKS = ['director', 'foreman', 'employee'];

function TeamView({ lang }: { lang: 'fr' | 'en' }) {
  const [team, setTeam] = useState<any[]>([]);
  const [role, setRole] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [inviteRank, setInviteRank] = useState('employee');
  const [inviteEmail, setInviteEmail] = useState('');
  const [generating, setGenerating] = useState(false);
  const [permissions, setPermissions] = useState<any[]>([]);
  const [permSaving, setPermSaving] = useState<string | null>(null);
  const [pendingInvites, setPendingInvites] = useState<any[]>([]);
  const fr = lang === 'fr';

  function load() {
    api.get<any>('/municipal-portal/my-access-status').then((s) => setRole(s.role ?? null)).catch(() => {});
    api.get<any[]>('/municipal-portal/my-region/team').then(setTeam).catch(() => {});
    api.get<any[]>('/municipal-portal/my-region/rank-permissions').then(setPermissions).catch(() => {});
    api.get<any[]>('/municipal-portal/my-region/invites').then(setPendingInvites).catch(() => {});
  }

  useEffect(load, []);

  async function remove(userId: string) {
    setFeedback(null);
    try {
      await api.post(`/municipal-portal/my-region/team/${userId}/remove`, {});
      load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur.');
    }
  }

  async function changeRank(userId: string, rank: string) {
    setFeedback(null);
    try {
      await api.patch(`/municipal-portal/my-region/team/${userId}/rank`, { rank });
      load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur.');
    }
  }

  async function generateInvite() {
    setGenerating(true);
    setFeedback(null);
    try {
      await api.post('/municipal-portal/my-region/invites', { rank: inviteRank, email: inviteEmail.trim() || undefined });
      setInviteEmail('');
      load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setGenerating(false);
    }
  }

  function copyInviteLink(token: string) {
    navigator.clipboard.writeText(`${window.location.origin}/?municipalInvite=${token}`);
    setFeedback(fr ? 'Lien copié.' : 'Link copied.');
  }

  async function resendInvite(inviteId: string) {
    setFeedback(null);
    try {
      await api.post(`/municipal-portal/my-region/invites/${inviteId}/resend`, {});
      setFeedback(fr ? 'Courriel renvoyé.' : 'Email resent.');
      load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur.');
    }
  }

  async function cancelInvite(inviteId: string) {
    setFeedback(null);
    try {
      await api.post(`/municipal-portal/my-region/invites/${inviteId}/cancel`, {});
      load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur.');
    }
  }

  function togglePermission(rank: string, key: string) {
    setPermissions((prev) => prev.map((p) => (p.rank === rank ? { ...p, [key]: !p[key] } : p)));
  }

  async function savePermissions(rank: string) {
    setPermSaving(rank);
    try {
      const p = permissions.find((x) => x.rank === rank);
      await api.patch(`/municipal-portal/my-region/rank-permissions/${rank}`, {
        can_view_dashboard: p.can_view_dashboard, can_view_reports: p.can_view_reports, can_edit_reports: p.can_edit_reports,
        can_view_stats: p.can_view_stats, can_view_comparatives: p.can_view_comparatives, can_manage_team: p.can_manage_team, can_manage_settings: p.can_manage_settings,
      });
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setPermSaving(null);
    }
  }

  const ROLE_LABELS: Record<string, { fr: string; en: string }> = {
    municipal_admin: { fr: 'Gestionnaire principal', en: 'Principal manager' },
    municipal_staff: { fr: 'Employé', en: 'Staff' },
  };
  const PERMISSION_LABELS: { key: string; fr: string; en: string }[] = [
    { key: 'can_view_dashboard', fr: 'Voir le tableau de bord', en: 'View dashboard' },
    { key: 'can_view_reports', fr: 'Voir les signalements', en: 'View reports' },
    { key: 'can_edit_reports', fr: 'Modifier les signalements et leur statut', en: 'Edit reports and their status' },
    { key: 'can_view_stats', fr: 'Voir les statistiques', en: 'View statistics' },
    { key: 'can_view_comparatives', fr: 'Voir les comparatifs', en: 'View comparatives' },
    { key: 'can_manage_team', fr: "Gérer l'équipe", en: 'Manage team' },
    { key: 'can_manage_settings', fr: 'Gérer les paramètres', en: 'Manage settings' },
  ];

  return (
    <div>
      <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Équipe' : 'Team'} ({team.length})</div>
      <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 14, lineHeight: 1.5 }}>
        {fr
          ? "Un nouveau membre peut rejoindre via un lien d'invitation (ci-dessous) ou en soumettant une demande d'accès (bouton 🏛️ dans le client mon511, à approuver dans la file de demandes en attente)."
          : 'A new member can join via an invitation link (below) or by submitting an access request (🏛️ button in the mon511 client, to be approved in the pending requests queue).'}
      </p>
      {feedback && <div className="error-banner">{feedback}</div>}

      {team.map((m) => (
        <div key={m.id} className="report-card" style={{ cursor: 'default' }}>
          <div className="rc-icon-hex">{m.roleName === 'municipal_admin' ? '👑' : (RANK_LABELS[m.rank]?.icon ?? '👤')}</div>
          <div className="rc-body">
            <div className="rc-title">{m.firstName} {m.lastName}</div>
            <div className="rc-meta">
              {ROLE_LABELS[m.roleName] ? (fr ? ROLE_LABELS[m.roleName].fr : ROLE_LABELS[m.roleName].en) : m.roleName}
              {m.roleName === 'municipal_staff' && m.rank && <> — {fr ? RANK_LABELS[m.rank]?.fr : RANK_LABELS[m.rank]?.en}</>}
              {' · '}{m.email}
            </div>
          </div>
          {role === 'municipal_admin' && m.roleName === 'municipal_staff' && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <CustomSelect
                value={m.rank ?? 'employee'}
                onChange={(v) => changeRank(m.id, v)}
                options={RANKS.map((r) => ({ value: r, label: fr ? RANK_LABELS[r].fr : RANK_LABELS[r].en }))}
                style={{ width: 140 }}
              />
              <button className="btn-ghost btn-danger" style={{ fontSize: 11 }} onClick={() => remove(m.id)}>{fr ? 'Retirer' : 'Remove'}</button>
            </div>
          )}
        </div>
      ))}

      {role === 'municipal_admin' && (
        <>
          <div className="section-label">{fr ? "Inviter un nouveau membre" : 'Invite a new member'}</div>
          <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 8 }}>
            {fr
              ? "Avec un courriel : la personne reçoit un lien directement — si elle n'a pas encore de compte mon511, elle peut en créer un avec cette même adresse et rejoindra automatiquement l'équipe. Sans courriel : génère un lien générique à copier-coller toi-même."
              : "With an email: the person receives a link directly — if they don't have a mon511 account yet, they can create one with that same address and will automatically join the team. Without email: generates a generic link for you to copy and share."}
          </p>
          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
            <CustomSelect
              value={inviteRank}
              onChange={setInviteRank}
              options={RANKS.map((r) => ({ value: r, label: fr ? RANK_LABELS[r].fr : RANK_LABELS[r].en }))}
              style={{ width: 160 }}
            />
            <input
              className="text-input"
              type="email"
              style={{ flex: '1 1 200px' }}
              placeholder={fr ? 'Courriel (optionnel)' : 'Email (optional)'}
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <button className="btn-primary" onClick={generateInvite} disabled={generating}>
              {generating ? (fr ? 'Envoi...' : 'Sending...') : (fr ? 'Inviter le membre' : 'Invite member')}
            </button>
          </div>

          {pendingInvites.length > 0 && (
            <>
              <div className="section-label">{fr ? 'Invitations en attente' : 'Pending invitations'} ({pendingInvites.length})</div>
              {pendingInvites.map((inv) => (
                <div key={inv.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--panel-border)', fontSize: 12 }}>
                  <div>
                    {RANK_LABELS[inv.rank]?.icon} {fr ? RANK_LABELS[inv.rank]?.fr : RANK_LABELS[inv.rank]?.en}
                    {inv.email && <> — {inv.email}</>}
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                      {fr ? 'Expire le' : 'Expires'} {new Date(inv.expiresAt).toLocaleString(fr ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => copyInviteLink(inv.token)}>{fr ? '📋 Copier le lien' : '📋 Copy link'}</button>
                    {inv.email && (
                      <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => resendInvite(inv.id)}>{fr ? '✉️ Renvoyer' : '✉️ Resend'}</button>
                    )}
                    <button className="btn-ghost btn-danger" style={{ fontSize: 11 }} onClick={() => cancelInvite(inv.id)}>{fr ? 'Annuler' : 'Cancel'}</button>
                  </div>
                </div>
              ))}
            </>
          )}

          <div className="section-label">{fr ? 'Permissions par rang' : 'Permissions by rank'}</div>
          <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 12 }}>
            {fr ? 'Le gestionnaire principal garde toujours un accès complet, peu importe ces réglages.' : 'The principal manager always keeps full access, regardless of these settings.'}
          </p>
          {RANKS.map((rank) => {
            const p = permissions.find((x) => x.rank === rank);
            if (!p) return null;
            return (
              <div key={rank} style={{ background: 'var(--panel-hover)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ fontWeight: 600, fontSize: 12.5, marginBottom: 8 }}>{RANK_LABELS[rank].icon} {fr ? RANK_LABELS[rank].fr : RANK_LABELS[rank].en}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 4, marginBottom: 8 }}>
                  {PERMISSION_LABELS.map((pl) => (
                    <label key={pl.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, cursor: 'pointer' }}>
                      <input type="checkbox" checked={!!p[pl.key]} onChange={() => togglePermission(rank, pl.key)} />
                      {fr ? pl.fr : pl.en}
                    </label>
                  ))}
                </div>
                <button className="btn-ghost" style={{ fontSize: 11 }} onClick={() => savePermissions(rank)} disabled={permSaving === rank}>
                  {permSaving === rank ? (fr ? 'Enregistrement...' : 'Saving...') : (fr ? 'Enregistrer' : 'Save')}
                </button>
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}

function ReportSettingsView({ lang }: { lang: 'fr' | 'en' }) {
  const fr = lang === 'fr';
  const [reportSettings, setReportSettings] = useState<{ enabled: boolean; frequency: 'weekly' | 'monthly'; enabled_stats: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [slaRules, setSlaRules] = useState<any[]>([]);
  const [problemTypes, setProblemTypes] = useState<any[]>([]);
  const [newSlaTypeId, setNewSlaTypeId] = useState('');
  const [newSlaAck, setNewSlaAck] = useState('48');
  const [newSlaRes, setNewSlaRes] = useState('336');
  const [slaSaving, setSlaSaving] = useState(false);
  const [auditLog, setAuditLog] = useState<any[]>([]);
  const [auditFilter, setAuditFilter] = useState('all');

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
    api.get<any[]>('/municipal-portal/my-region/sla-rules').then(setSlaRules).catch(() => {});
    api.get<any[]>('/problem-types').then(setProblemTypes).catch(() => {});
  }, []);

  useEffect(() => {
    const params = auditFilter !== 'all' ? `?targetType=${auditFilter}` : '';
    api.get<any[]>(`/municipal-portal/my-region/audit-log${params}`).then(setAuditLog).catch(() => {});
  }, [auditFilter]);

  function loadSlaRules() {
    api.get<any[]>('/municipal-portal/my-region/sla-rules').then(setSlaRules).catch(() => {});
  }

  async function saveSlaRule(problemTypeId: string | null, ackHours: number, resHours: number) {
    setSlaSaving(true);
    try {
      await api.post('/municipal-portal/my-region/sla-rules', { problemTypeId, targetAcknowledgmentHours: ackHours, targetResolutionHours: resHours });
      setNewSlaTypeId('');
      setNewSlaAck('48');
      setNewSlaRes('336');
      loadSlaRules();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSlaSaving(false);
    }
  }

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

      <div className="section-label">{fr ? 'Règles SLA (délais de service)' : 'SLA rules (service delays)'}</div>
      <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 12 }}>
        {fr
          ? "Délai cible avant prise en charge et avant résolution. Une règle sans type de problème précis (« Tous les types ») sert de valeur par défaut."
          : 'Target delay before acknowledgment and before resolution. A rule without a specific problem type ("All types") serves as the default.'}
      </p>
      {slaRules.map((r) => (
        <div key={r.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--panel-border)', fontSize: 12 }}>
          <span>{r.problemTypeName ?? (fr ? 'Tous les types' : 'All types')}</span>
          <span style={{ color: 'var(--text-muted)' }}>
            {fr ? 'Prise en charge' : 'Ack.'} {r.targetAcknowledgmentHours}h · {fr ? 'Résolution' : 'Res.'} {r.targetResolutionHours}h
          </span>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <CustomSelect
          value={newSlaTypeId}
          onChange={setNewSlaTypeId}
          options={[{ value: '', label: fr ? 'Tous les types (défaut)' : 'All types (default)' }, ...problemTypes.map((t: any) => ({ value: t.id, label: `${t.icon ?? ''} ${t.name_fr}` }))]}
          style={{ flex: '1 1 200px' }}
        />
        <input className="text-input" type="number" style={{ width: 90 }} value={newSlaAck} onChange={(e) => setNewSlaAck(e.target.value)} placeholder={fr ? 'Prise en charge (h)' : 'Ack. (h)'} />
        <input className="text-input" type="number" style={{ width: 90 }} value={newSlaRes} onChange={(e) => setNewSlaRes(e.target.value)} placeholder={fr ? 'Résolution (h)' : 'Res. (h)'} />
        <button className="btn-ghost" onClick={() => saveSlaRule(newSlaTypeId || null, Number(newSlaAck), Number(newSlaRes))} disabled={slaSaving}>
          {slaSaving ? (fr ? 'Enregistrement...' : 'Saving...') : (fr ? 'Ajouter/mettre à jour' : 'Add/update')}
        </button>
      </div>

      <div className="section-label">{fr ? "Journal d'activité" : 'Activity log'}</div>
      <p style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 10 }}>
        {fr ? 'Qui a fait quoi et quand — les 100 dernières actions.' : 'Who did what and when — the last 100 actions.'}
      </p>
      <CustomSelect
        value={auditFilter}
        onChange={setAuditFilter}
        options={[
          { value: 'all', label: fr ? 'Toutes les cibles' : 'All targets' },
          { value: 'incident', label: fr ? 'Signalements/incidents' : 'Reports/incidents' },
          { value: 'work_order', label: fr ? 'Bons de travail' : 'Work orders' },
          { value: 'team_member', label: fr ? 'Équipe' : 'Team' },
        ]}
        style={{ marginBottom: 10, width: 220 }}
      />
      {auditLog.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fr ? 'Aucune action enregistrée.' : 'No actions recorded.'}</div>}
      {auditLog.map((entry) => {
        const ACTION_LABELS: Record<string, { fr: string; en: string }> = {
          status_changed: { fr: 'a changé le statut', en: 'changed the status' },
          assigned: { fr: "a changé l'assignation", en: 'changed the assignment' },
          priority_overridden: { fr: 'a remplacé la priorité', en: 'overrode the priority' },
          public_status_changed: { fr: 'a changé le statut public', en: 'changed the public status' },
          team_member_removed: { fr: "a retiré un membre de l'équipe", en: 'removed a team member' },
          rank_changed: { fr: 'a changé un rang', en: 'changed a rank' },
        };
        const actionLabel = ACTION_LABELS[entry.action] ?? { fr: entry.action, en: entry.action };
        const actorName = entry.actorFirstName || entry.actorLastName ? `${entry.actorFirstName ?? ''} ${entry.actorLastName ?? ''}`.trim() : (entry.actorEmail ?? (fr ? 'Système' : 'System'));
        return (
          <div key={entry.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--panel-border)', fontSize: 11.5 }}>
            <span style={{ color: 'var(--text-muted)' }}>
              {new Date(entry.createdAt).toLocaleString(fr ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </span>
            {' — '}
            <strong>{actorName}</strong> {fr ? actionLabel.fr : actionLabel.en}
            {entry.details && (entry.details.from !== undefined || entry.details.to !== undefined) && (
              <span style={{ color: 'var(--text-muted)' }}>
                {' '}({entry.details.from !== undefined && entry.details.from !== null ? `${entry.details.from} → ` : ''}{entry.details.to})
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

const INTERNAL_STATUS_OPTIONS: { key: 'new' | 'acknowledged' | 'in_progress' | 'done'; icon: string; label: { fr: string; en: string } }[] = [
  { key: 'new', icon: '🔴', label: { fr: 'Nouveau', en: 'New' } },
  { key: 'acknowledged', icon: '🟠', label: { fr: 'Reconnu', en: 'Acknowledged' } },
  { key: 'in_progress', icon: '🟣', label: { fr: 'En cours', en: 'In progress' } },
  { key: 'done', icon: '🔵', label: { fr: 'Complété', en: 'Done' } },
];


const WO_STATUS_LABELS: Record<string, { fr: string; en: string; icon: string }> = {
  draft: { fr: 'Brouillon', en: 'Draft', icon: '📝' },
  scheduled: { fr: 'Planifié', en: 'Scheduled', icon: '📅' },
  in_progress: { fr: 'En cours', en: 'In progress', icon: '🔧' },
  completed: { fr: 'Complété', en: 'Completed', icon: '✅' },
  cancelled: { fr: 'Annulé', en: 'Cancelled', icon: '✕' },
};
const WO_PRIORITY_LABELS: Record<string, { fr: string; en: string; icon: string }> = {
  low: { fr: 'Basse', en: 'Low', icon: '🔵' },
  medium: { fr: 'Moyenne', en: 'Medium', icon: '🟡' },
  high: { fr: 'Haute', en: 'High', icon: '🟠' },
  urgent: { fr: 'Urgente', en: 'Urgent', icon: '🔴' },
};

/** Liste des bons de travail — le "plus complet possible" demandé :
 * peuvent partir d'un incident existant OU exister librement (ex.
 * entretien préventif sans signalement citoyen). */
function WorkOrdersListView({ lang, pendingNavTarget, onNavTargetConsumed }: { lang: 'fr' | 'en'; pendingNavTarget?: { type: 'incident' | 'work_order'; groupKey: string } | null; onNavTargetConsumed?: () => void }) {
  const [orders, setOrders] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const fr = lang === 'fr';

  useEffect(() => {
    if (pendingNavTarget?.type === 'work_order') {
      setDetailId(pendingNavTarget.groupKey);
      onNavTargetConsumed?.();
    }
  }, [pendingNavTarget]);

  function load() {
    const params = new URLSearchParams();
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (priorityFilter !== 'all') params.set('priority', priorityFilter);
    api.get<any[]>(`/municipal-portal/my-region/work-orders?${params.toString()}`).then(setOrders).catch(() => {});
  }

  useEffect(load, [statusFilter, priorityFilter]);

  if (detailId) {
    return <WorkOrderDetailScreen lang={lang} id={detailId} onBack={() => { setDetailId(null); load(); }} />;
  }
  if (creating) {
    return <WorkOrderCreateForm lang={lang} onCreated={(id) => { setCreating(false); setDetailId(id); }} onCancel={() => setCreating(false)} />;
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 4 }}>
        <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Interventions' : 'Interventions'} ({orders.length})</div>
        <button className="btn-primary" onClick={() => setCreating(true)}>+ {fr ? 'Nouveau bon de travail' : 'New work order'}</button>
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
        <CustomSelect
          value={statusFilter}
          onChange={setStatusFilter}
          options={[{ value: 'all', label: fr ? 'Tous les statuts' : 'All statuses' }, ...Object.entries(WO_STATUS_LABELS).map(([k, v]) => ({ value: k, label: `${v.icon} ${fr ? v.fr : v.en}` }))]}
          style={{ flex: '1 1 160px' }}
        />
        <CustomSelect
          value={priorityFilter}
          onChange={setPriorityFilter}
          options={[{ value: 'all', label: fr ? 'Toutes les priorités' : 'All priorities' }, ...Object.entries(WO_PRIORITY_LABELS).map(([k, v]) => ({ value: k, label: `${v.icon} ${fr ? v.fr : v.en}` }))]}
          style={{ flex: '1 1 160px' }}
        />
      </div>

      {orders.length === 0 && <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{fr ? 'Aucun bon de travail.' : 'No work orders.'}</div>}
      {orders.map((o) => (
        <div key={o.id} className="report-card" onClick={() => setDetailId(o.id)}>
          <div className="rc-icon-hex">{o.incidentIcon ?? '🔧'}</div>
          <div className="rc-body">
            <div className="rc-title">{o.title}</div>
            <div className="rc-meta">
              {WO_STATUS_LABELS[o.status]?.icon} {fr ? WO_STATUS_LABELS[o.status]?.fr : WO_STATUS_LABELS[o.status]?.en}
              {' · '}{WO_PRIORITY_LABELS[o.priority]?.icon} {fr ? WO_PRIORITY_LABELS[o.priority]?.fr : WO_PRIORITY_LABELS[o.priority]?.en}
              {(o.incidentAddressText || o.addressText) && <> · {o.incidentAddressText ?? o.addressText}</>}
              {o.assignedTo && <> · {o.assignedTo}</>}
              {o.dueDate && <> · {fr ? 'Échéance' : 'Due'} {new Date(o.dueDate).toLocaleDateString(fr ? 'fr-CA' : 'en-CA', { day: 'numeric', month: 'short' })}</>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Formulaire de création — depuis un incident existant (groupKey
 * fourni) ou complètement libre (adresse saisie directement). */
function WorkOrderCreateForm({ lang, groupKey, onCreated, onCancel }: { lang: 'fr' | 'en'; groupKey?: string; onCreated: (id: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState('medium');
  const [assignedTo, setAssignedTo] = useState('');
  const [addressText, setAddressText] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [estimatedHours, setEstimatedHours] = useState('');
  const [estimatedCost, setEstimatedCost] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fr = lang === 'fr';

  async function submit() {
    if (!title.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const r = await api.post<{ id: string }>('/municipal-portal/my-region/work-orders', {
        groupKey,
        title: title.trim(),
        description: description.trim() || undefined,
        priority,
        assignedTo: assignedTo.trim() || undefined,
        addressText: !groupKey ? (addressText.trim() || undefined) : undefined,
        scheduledDate: scheduledDate || undefined,
        dueDate: dueDate || undefined,
        estimatedHours: estimatedHours ? Number(estimatedHours) : undefined,
        estimatedCost: estimatedCost ? Number(estimatedCost) : undefined,
      });
      onCreated(r.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <button className="btn-ghost" style={{ marginBottom: 14, fontSize: 12.5 }} onClick={onCancel}>← {fr ? 'Annuler' : 'Cancel'}</button>
      <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Nouveau bon de travail' : 'New work order'}</div>
      {error && <div className="error-banner">{error}</div>}

      <div className="field-group">
        <label className="field-label">{fr ? 'Titre' : 'Title'}</label>
        <input className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={fr ? 'Ex. Réparation nid-de-poule' : 'E.g. Pothole repair'} />
      </div>
      <div className="field-group">
        <label className="field-label">{fr ? 'Description' : 'Description'}</label>
        <textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      {!groupKey && (
        <div className="field-group">
          <label className="field-label">{fr ? 'Adresse' : 'Address'}</label>
          <input className="text-input" value={addressText} onChange={(e) => setAddressText(e.target.value)} placeholder={fr ? "Ex. Entretien préventif — pas lié à un signalement" : 'E.g. Preventive maintenance — not linked to a report'} />
        </div>
      )}
      <div className="field-group">
        <label className="field-label">{fr ? 'Priorité' : 'Priority'}</label>
        <CustomSelect value={priority} onChange={setPriority} options={Object.entries(WO_PRIORITY_LABELS).map(([k, v]) => ({ value: k, label: `${v.icon} ${fr ? v.fr : v.en}` }))} />
      </div>
      <div className="field-group">
        <label className="field-label">{fr ? 'Assigné à' : 'Assigned to'}</label>
        <input className="text-input" value={assignedTo} onChange={(e) => setAssignedTo(e.target.value)} placeholder={fr ? 'Nom de la personne ou de l\'équipe' : 'Name of person or team'} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="field-group" style={{ flex: 1 }}>
          <label className="field-label">{fr ? 'Date prévue' : 'Scheduled date'}</label>
          <input className="text-input" type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
        </div>
        <div className="field-group" style={{ flex: 1 }}>
          <label className="field-label">{fr ? 'Échéance' : 'Due date'}</label>
          <input className="text-input" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="field-group" style={{ flex: 1 }}>
          <label className="field-label">{fr ? 'Heures estimées' : 'Estimated hours'}</label>
          <input className="text-input" type="number" step="0.5" value={estimatedHours} onChange={(e) => setEstimatedHours(e.target.value)} />
        </div>
        <div className="field-group" style={{ flex: 1 }}>
          <label className="field-label">{fr ? 'Coût estimé ($)' : 'Estimated cost ($)'}</label>
          <input className="text-input" type="number" step="0.01" value={estimatedCost} onChange={(e) => setEstimatedCost(e.target.value)} />
        </div>
      </div>
      <button className="btn-primary" onClick={submit} disabled={saving || !title.trim()}>
        {saving ? (fr ? 'Création...' : 'Creating...') : (fr ? 'Créer le bon de travail' : 'Create work order')}
      </button>
    </div>
  );
}

/** Fiche détaillée d'un bon de travail — le plus complet possible :
 * statut, priorité, assignation, dates, heures/coûts estimés et
 * réels, notes, liste de vérification, photos avant/pendant/après. */
function WorkOrderDetailScreen({ lang, id, onBack }: { lang: 'fr' | 'en'; id: string; onBack: () => void }) {
  const [detail, setDetail] = useState<any>(null);
  const [newTask, setNewTask] = useState('');
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const fr = lang === 'fr';

  function load() {
    api.get<any>(`/municipal-portal/my-region/work-orders/${id}`).then(setDetail).catch(() => {});
  }
  useEffect(load, [id]);

  async function patch(changes: Record<string, any>) {
    setSaving(true);
    try {
      await api.patch(`/municipal-portal/my-region/work-orders/${id}`, changes);
      load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  }

  async function addTask() {
    if (!newTask.trim()) return;
    await api.post(`/municipal-portal/my-region/work-orders/${id}/tasks`, { description: newTask.trim() }).catch(() => {});
    setNewTask('');
    load();
  }

  async function toggleTask(taskId: string) {
    await api.post(`/municipal-portal/my-region/work-order-tasks/${taskId}/toggle`, {}).catch(() => {});
    load();
  }

  async function deleteTask(taskId: string) {
    await api.post(`/municipal-portal/my-region/work-order-tasks/${taskId}/delete`, {}).catch(() => {});
    load();
  }

  async function uploadPhoto(phase: string, file: File) {
    const form = new FormData();
    form.append('file', file);
    form.append('phase', phase);
    await api.post(`/municipal-portal/my-region/work-orders/${id}/photos`, form).catch(() => {});
    load();
  }

  async function confirmDelete() {
    await api.post(`/municipal-portal/my-region/work-orders/${id}/delete`, {}).catch(() => {});
    onBack();
  }

  if (!detail) return <div className="center-msg">{fr ? 'Chargement...' : 'Loading...'}</div>;

  const completedTasks = detail.tasks.filter((t: any) => t.completed).length;

  return (
    <div>
      <button className="btn-ghost" style={{ marginBottom: 14, fontSize: 12.5 }} onClick={onBack}>← {fr ? 'Retour à la liste' : 'Back to list'}</button>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 700 }}>{detail.title}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
            {detail.incident ? `${detail.incident.icon ?? '📍'} ${detail.incident.typeName} — ${detail.incident.addressText ?? '—'}` : (detail.address_text ?? (fr ? 'Aucune adresse' : 'No address'))}
          </div>
        </div>
        <button className="btn-ghost btn-danger" style={{ fontSize: 11.5 }} onClick={() => setConfirmingDelete(true)}>{fr ? 'Supprimer' : 'Delete'}</button>
      </div>
      {confirmingDelete && (
        <div style={{ background: 'var(--panel-hover)', borderRadius: 10, padding: 12, margin: '10px 0' }}>
          <div style={{ fontSize: 12.5, marginBottom: 8 }}>{fr ? 'Supprimer ce bon de travail définitivement ?' : 'Permanently delete this work order?'}</div>
          <div className="action-row">
            <button className="btn-primary" onClick={confirmDelete}>{fr ? 'Supprimer' : 'Delete'}</button>
            <button className="btn-ghost" onClick={() => setConfirmingDelete(false)}>{fr ? 'Annuler' : 'Cancel'}</button>
          </div>
        </div>
      )}

      {detail.description && <p style={{ fontSize: 12.5, marginBottom: 16 }}>{detail.description}</p>}

      <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Statut' : 'Status'}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {Object.entries(WO_STATUS_LABELS).map(([k, v]) => (
          <button key={k} className="btn-ghost" style={{ fontSize: 12, border: detail.status === k ? '1.5px solid var(--accent-signal)' : '1px solid var(--panel-border)' }} onClick={() => patch({ status: k })} disabled={saving}>
            {v.icon} {fr ? v.fr : v.en}
          </button>
        ))}
      </div>

      <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Priorité' : 'Priority'}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 }}>
        {Object.entries(WO_PRIORITY_LABELS).map(([k, v]) => (
          <button key={k} className="btn-ghost" style={{ fontSize: 12, border: detail.priority === k ? '1.5px solid var(--accent-signal)' : '1px solid var(--panel-border)' }} onClick={() => patch({ priority: k })} disabled={saving}>
            {v.icon} {fr ? v.fr : v.en}
          </button>
        ))}
      </div>

      <div className="field-group">
        <label className="field-label">{fr ? 'Assigné à' : 'Assigned to'}</label>
        <input className="text-input" defaultValue={detail.assigned_to ?? ''} onBlur={(e) => patch({ assignedTo: e.target.value })} />
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="field-group" style={{ flex: 1 }}>
          <label className="field-label">{fr ? 'Date prévue' : 'Scheduled date'}</label>
          <input className="text-input" type="date" defaultValue={detail.scheduled_date ?? ''} onBlur={(e) => patch({ scheduledDate: e.target.value })} />
        </div>
        <div className="field-group" style={{ flex: 1 }}>
          <label className="field-label">{fr ? 'Échéance' : 'Due date'}</label>
          <input className="text-input" type="date" defaultValue={detail.due_date ?? ''} onBlur={(e) => patch({ dueDate: e.target.value })} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="field-group" style={{ flex: 1 }}>
          <label className="field-label">{fr ? 'Heures estimées' : 'Estimated hours'}</label>
          <input className="text-input" type="number" step="0.5" defaultValue={detail.estimated_hours ?? ''} onBlur={(e) => patch({ estimatedHours: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <div className="field-group" style={{ flex: 1 }}>
          <label className="field-label">{fr ? 'Heures réelles' : 'Actual hours'}</label>
          <input className="text-input" type="number" step="0.5" defaultValue={detail.actual_hours ?? ''} onBlur={(e) => patch({ actualHours: e.target.value ? Number(e.target.value) : null })} />
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10 }}>
        <div className="field-group" style={{ flex: 1 }}>
          <label className="field-label">{fr ? 'Coût estimé ($)' : 'Estimated cost ($)'}</label>
          <input className="text-input" type="number" step="0.01" defaultValue={detail.estimated_cost ?? ''} onBlur={(e) => patch({ estimatedCost: e.target.value ? Number(e.target.value) : null })} />
        </div>
        <div className="field-group" style={{ flex: 1 }}>
          <label className="field-label">{fr ? 'Coût réel ($)' : 'Actual cost ($)'}</label>
          <input className="text-input" type="number" step="0.01" defaultValue={detail.actual_cost ?? ''} onBlur={(e) => patch({ actualCost: e.target.value ? Number(e.target.value) : null })} />
        </div>
      </div>
      <div className="field-group">
        <label className="field-label">{fr ? 'Notes' : 'Notes'}</label>
        <textarea rows={3} defaultValue={detail.notes ?? ''} onBlur={(e) => patch({ notes: e.target.value })} />
      </div>
      {feedback && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{feedback}</div>}

      <div className="section-label">{fr ? 'Liste de vérification' : 'Checklist'} {detail.tasks.length > 0 && `(${completedTasks}/${detail.tasks.length})`}</div>
      {detail.tasks.map((t: any) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0' }}>
          <input type="checkbox" checked={t.completed} onChange={() => toggleTask(t.id)} />
          <span style={{ flex: 1, fontSize: 12.5, textDecoration: t.completed ? 'line-through' : 'none', color: t.completed ? 'var(--text-muted)' : 'var(--text-body)' }}>{t.description}</span>
          <button className="btn-ghost" style={{ fontSize: 10.5 }} onClick={() => deleteTask(t.id)}>✕</button>
        </div>
      ))}
      <div style={{ display: 'flex', gap: 8, marginTop: 8, marginBottom: 20 }}>
        <input className="text-input" style={{ flex: 1 }} value={newTask} onChange={(e) => setNewTask(e.target.value)} placeholder={fr ? 'Ajouter une étape...' : 'Add a step...'} onKeyDown={(e) => e.key === 'Enter' && addTask()} />
        <button className="btn-ghost" onClick={addTask}>+ {fr ? 'Ajouter' : 'Add'}</button>
      </div>

      <div className="section-label">{fr ? 'Photos' : 'Photos'}</div>
      {(['before', 'during', 'after'] as const).map((phase) => (
        <div key={phase} style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 6 }}>
            {phase === 'before' ? (fr ? 'Avant' : 'Before') : phase === 'during' ? (fr ? 'Pendant' : 'During') : (fr ? 'Après' : 'After')}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {detail.photos.filter((p: any) => p.phase === phase).map((p: any) => (
              <img key={p.id} src={p.url} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 8 }} />
            ))}
            <label className="btn-ghost" style={{ fontSize: 11, cursor: 'pointer' }}>
              + {fr ? 'Ajouter' : 'Add'}
              <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(phase, f); e.target.value = ''; }} />
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}

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
  const [creatingWorkOrder, setCreatingWorkOrder] = useState(false);
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

  async function overridePriority(priority: string) {
    setSaving(true);
    try {
      await api.post(`/municipal-portal/my-region/incidents/${groupKey}/priority/override`, { priority });
      load();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  }

  async function resetPriorityToAutomatic() {
    setSaving(true);
    try {
      await api.post(`/municipal-portal/my-region/incidents/${groupKey}/priority/reset`, {});
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

      {creatingWorkOrder ? (
        <WorkOrderCreateForm lang={lang} groupKey={groupKey} onCreated={() => setCreatingWorkOrder(false)} onCancel={() => setCreatingWorkOrder(false)} />
      ) : (
      <>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 24 }}>{detail.problemTypeIcon ?? '📍'}</span>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700 }}>{detail.problemTypeNameFr}</div>
            {!editing && <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>{detail.addressText ?? '—'}</div>}
          </div>
        </div>
        {!editing && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn-ghost" style={{ fontSize: 11.5 }} onClick={() => setCreatingWorkOrder(true)}>🔧 {fr ? 'Créer un bon de travail' : 'Create work order'}</button>
            <button className="btn-ghost" style={{ fontSize: 11.5 }} onClick={() => setEditing(true)}>✏️ {fr ? 'Modifier' : 'Edit'}</button>
          </div>
        )}
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
        {detail.caseNumber && <>📋 {detail.caseNumber} · </>}
        {detail.reportCount > 1
          ? (fr ? `${detail.reportCount} signalements citoyens regroupés` : `${detail.reportCount} grouped citizen reports`)
          : (fr ? '1 signalement' : '1 report')}
        {detail.sla && (
          <>
            {' · '}{fr ? 'Prise en charge' : 'Acknowledgment'}: {detail.sla.acknowledgment === 'late' ? '⏰' : detail.sla.acknowledgment === 'at_risk' ? '⚠️' : '✅'}
            {' · '}{fr ? 'Résolution' : 'Resolution'}: {detail.sla.resolution === 'late' ? '⏰' : detail.sla.resolution === 'at_risk' ? '⚠️' : detail.sla.resolution === 'done' ? '✔️' : '✅'}
          </>
        )}
      </div>

      <div className="section-label" style={{ marginTop: 0 }}>{fr ? 'Priorité' : 'Priority'}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 6 }}>
        {['low', 'medium', 'high', 'urgent'].map((p) => (
          <button key={p} className="btn-ghost" style={{ fontSize: 12, border: detail.priority === p ? '1.5px solid var(--accent-signal)' : '1px solid var(--panel-border)' }} onClick={() => overridePriority(p)} disabled={saving}>
            {{ low: '🔵', medium: '🟡', high: '🟠', urgent: '🔴' }[p]} {{ low: fr ? 'Basse' : 'Low', medium: fr ? 'Moyenne' : 'Medium', high: fr ? 'Haute' : 'High', urgent: fr ? 'Urgente' : 'Urgent' }[p]}
          </button>
        ))}
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 20 }}>
        {detail.priorityOverridden ? (
          <>
            {fr ? 'Remplacée manuellement.' : 'Manually overridden.'}{' '}
            <span style={{ cursor: 'pointer', textDecoration: 'underline' }} onClick={resetPriorityToAutomatic}>{fr ? 'Redonner au calcul automatique' : 'Reset to automatic'}</span>
          </>
        ) : (
          detail.priorityScore !== null && (fr ? `Score automatique : ${detail.priorityScore}/100` : `Automatic score: ${detail.priorityScore}/100`)
        )}
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
      </>
      )}
    </div>
  );
}
