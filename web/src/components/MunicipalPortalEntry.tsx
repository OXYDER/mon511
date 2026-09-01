import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api';

interface Props {
  lang: 'fr' | 'en';
  onClose: () => void;
}

/** Point d'entrée unique du portail municipal — affiche l'un de trois
 * écrans selon le statut réel de l'usager, vérifié CÔTÉ SERVEUR à
 * chaque ouverture (jamais seulement le rôle stocké dans le jeton, qui
 * pourrait être périmé) :
 * - 'none' : formulaire de demande d'accès
 * - 'pending' : page d'attente, aucune interaction possible
 * - 'approved' : le vrai portail (pour l'instant minimal — le reste du
 *   portail, file de signalements/publications régionales, reste à
 *   construire, mais au moins l'accès est maintenant correctement
 *   gardé par rôle plutôt que de planter pour un compte non autorisé)
 *
 * IMPORTANT : un compte sans le rôle municipal_staff/municipal_admin
 * ne voit donc JAMAIS le contenu du portail, peu importe ce qu'il
 * tente — il voit soit le formulaire de demande, soit la page
 * d'attente, jamais une erreur.
 */
export default function MunicipalPortalEntry({ lang, onClose }: Props) {
  const [status, setStatus] = useState<{ status: 'none' | 'pending' | 'approved'; role?: string; regionName?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const fr = lang === 'fr';

  useEffect(() => {
    api.get<any>('/municipal-portal/my-access-status')
      .then(setStatus)
      .catch(() => setStatus({ status: 'none' }))
      .finally(() => setLoading(false));
  }, []);

  return createPortal(
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: 440 }}>
        <div className="modal-head">
          <div className="modal-title">{fr ? 'Portail municipal' : 'Municipal portal'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading && <div className="center-msg">{fr ? 'Chargement...' : 'Loading...'}</div>}
          {!loading && status?.status === 'none' && <RequestAccessForm lang={lang} onSubmitted={() => setStatus({ status: 'pending' })} />}
          {!loading && status?.status === 'pending' && <PendingScreen lang={lang} regionName={status.regionName} />}
          {!loading && status?.status === 'approved' && <ApprovedScreen lang={lang} regionName={status.regionName} role={status.role} />}
        </div>
      </div>
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

function ApprovedScreen({ lang, regionName, role }: { lang: 'fr' | 'en'; regionName?: string; role?: string }) {
  const fr = lang === 'fr';
  return (
    <div>
      <p style={{ fontSize: 13, marginBottom: 16 }}>
        {fr ? `Tu gères ${regionName ?? 'ta municipalité'} en tant que ` : `You manage ${regionName ?? 'your municipality'} as `}
        <strong>{role === 'municipal_admin' ? (fr ? 'gestionnaire principal' : 'principal manager') : (fr ? 'employé municipal' : 'municipal staff')}</strong>.
      </p>
      <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
        {fr
          ? "Le reste du portail (file des signalements, publications, statistiques) est en construction — reviens bientôt."
          : "The rest of the portal (reports queue, posts, statistics) is under construction — check back soon."}
      </p>
    </div>
  );
}
