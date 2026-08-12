import { useEffect, useState } from 'react';
import { api } from '../api';

interface Props {
  onClose: () => void;
  lang: 'fr' | 'en';
  prefill?: { subject: string; description: string } | null;
}

const STATUS_LABELS: Record<string, [string, string]> = {
  open: ['Ouvert', 'Open'],
  in_progress: ['En attente de réponse', 'Awaiting reply'],
  resolved: ['Fermé', 'Closed'],
};

const STATUS_COLORS: Record<string, string> = {
  open: 'var(--accent-signal)',
  in_progress: 'var(--official-blue)',
  resolved: 'var(--text-muted)',
};

export default function SupportTicketsModal({ onClose, lang, prefill }: Props) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ ticket: any; replies: any[]; attachments: any[] } | null>(null);
  const [creating, setCreating] = useState(!!prefill);
  const [subject, setSubject] = useState(prefill?.subject ?? '');
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [email, setEmail] = useState('');
  const [authenticatedEmail, setAuthenticatedEmail] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<any>('/users/me').then((me) => setAuthenticatedEmail(me.email)).catch(() => setAuthenticatedEmail(null));
  }, []);

  async function load() {
    try {
      const results = await api.get<any[]>('/support/tickets/mine');
      setTickets(results);
      if (!creating && !selectedId && results[0]) selectTicket(results[0].id);
      if (!creating && results.length === 0) setCreating(true);
    } catch {
      setTickets([]);
      setCreating(true);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function selectTicket(id: string) {
    setSelectedId(id);
    setCreating(false);
    const result = await api.get<{ ticket: any; replies: any[]; attachments: any[] }>(`/support/tickets/mine/${id}`);
    setDetail(result);
    api.post(`/support/tickets/mine/${id}/seen`, {}).catch(() => {});
  }

  async function submit() {
    const effectiveEmail = authenticatedEmail ?? email;
    if (!subject.trim() || !description.trim() || !effectiveEmail.trim()) {
      setError(lang === 'fr' ? 'Sujet, description et courriel sont requis.' : 'Subject, description, and email are required.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const attachments: { url: string; filename: string }[] = [];
      for (const file of files) {
        const formData = new FormData();
        formData.append('file', file);
        const uploaded = await api.post<{ url: string; filename: string }>('/support/attachments', formData);
        attachments.push(uploaded);
      }
      await api.post('/support/tickets', { email: effectiveEmail, subject, description, attachments });
      setCreating(false);
      setSubject('');
      setDescription('');
      setFiles([]);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: 680, display: 'flex', flexDirection: 'column', height: 600, padding: 0 }}>
        <div className="modal-head">
          <div className="modal-title">🎫 {lang === 'fr' ? 'Billets de support' : 'Support tickets'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
          <div style={{ flex: '0 0 220px', borderRight: '1px solid var(--panel-border)', overflowY: 'auto', padding: 14 }}>
            <button
              className="btn-primary"
              style={{ width: '100%', marginBottom: 12, fontSize: 12.5 }}
              onClick={() => { setCreating(true); setSelectedId(null); setSubject(''); setDescription(''); }}
            >
              + {lang === 'fr' ? 'Nouveau billet' : 'New ticket'}
            </button>
            {tickets.map((t) => (
              <div
                key={t.id}
                onClick={() => selectTicket(t.id)}
                style={{
                  padding: '10px 10px', borderRadius: 8, cursor: 'pointer', marginBottom: 6,
                  background: t.id === selectedId ? 'var(--panel-hover)' : 'transparent',
                  border: `1px solid ${t.id === selectedId ? 'var(--accent-signal)' : 'transparent'}`,
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.subject}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{
                    fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3,
                    color: STATUS_COLORS[t.status] ?? 'var(--text-muted)',
                    border: `1px solid ${STATUS_COLORS[t.status] ?? 'var(--text-muted)'}`,
                    borderRadius: 5, padding: '1px 6px',
                  }}>
                    {(STATUS_LABELS[t.status] ?? [t.status, t.status])[lang === 'fr' ? 0 : 1]}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                    {new Date(t.created_at).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA')}
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
            {creating && (
              <>
                <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
                  {lang === 'fr' ? 'Nouveau billet' : 'New ticket'}
                </div>
                {error && <div className="error-banner">{error}</div>}
                {!authenticatedEmail && (
                  <div className="field-group">
                    <label className="field-label">{lang === 'fr' ? 'Ton courriel' : 'Your email'}</label>
                    <input className="text-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                  </div>
                )}
                <div className="field-group">
                  <label className="field-label">{lang === 'fr' ? 'Sujet' : 'Subject'}</label>
                  <input className="text-input" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">{lang === 'fr' ? 'Description' : 'Description'}</label>
                  <textarea rows={8} value={description} onChange={(e) => setDescription(e.target.value)} />
                </div>
                <div className="field-group">
                  <label className="field-label">{lang === 'fr' ? 'Pièces jointes (optionnel)' : 'Attachments (optional)'}</label>
                  <input type="file" multiple onChange={(e) => setFiles(Array.from(e.target.files ?? []))} />
                  {files.length > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                      {files.map((f) => f.name).join(', ')}
                    </div>
                  )}
                </div>
                <button className="btn-primary" onClick={submit} disabled={submitting}>
                  {submitting ? (lang === 'fr' ? 'Envoi...' : 'Sending...') : (lang === 'fr' ? 'Envoyer le billet' : 'Send ticket')}
                </button>
              </>
            )}

            {!creating && detail && (
              <>
                <div className="section-label" style={{ marginTop: 0, paddingTop: 0, borderTop: 'none' }}>
                  {detail.ticket.subject}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.3,
                    color: STATUS_COLORS[detail.ticket.status] ?? 'var(--text-muted)',
                    border: `1px solid ${STATUS_COLORS[detail.ticket.status] ?? 'var(--text-muted)'}`,
                    borderRadius: 5, padding: '2px 7px',
                  }}>
                    {(STATUS_LABELS[detail.ticket.status] ?? [detail.ticket.status, detail.ticket.status])[lang === 'fr' ? 0 : 1]}
                  </span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 16 }}>
                  {lang === 'fr' ? 'Numéro du billet' : 'Ticket ID'} : <code>{detail.ticket.id}</code>
                </div>

                {/* Fil de conversation unifié — message initial suivi des
                    réponses, tous présentés de la même façon (auteur +
                    date/heure précise), pour bien distinguer chaque
                    échange dans l'ordre. */}
                <div style={{ padding: 12, borderRadius: 10, background: 'var(--panel-hover)', marginBottom: 10, borderLeft: '3px solid var(--accent-signal)' }}>
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 4 }}>
                    {lang === 'fr' ? 'Toi' : 'You'} — {new Date(detail.ticket.created_at).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                    {detail.ticket.description}
                  </div>
                  {detail.attachments.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                      {detail.attachments.map((a) => (
                        <a key={a.id} href={a.url} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 12, color: 'var(--accent-signal)', marginBottom: 4 }}>
                          📎 {a.filename}
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                {detail.replies.map((r) => (
                  <div
                    key={r.id}
                    style={{
                      padding: 12, borderRadius: 10, marginBottom: 10,
                      background: r.author_type === 'admin' ? 'rgba(255,90,31,0.08)' : 'var(--panel-hover)',
                      borderLeft: `3px solid ${r.author_type === 'admin' ? 'var(--accent-signal)' : 'var(--panel-border)'}`,
                    }}
                  >
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 4, fontWeight: r.author_type === 'admin' ? 700 : 400 }}>
                      {r.author_type === 'admin' ? (lang === 'fr' ? "🛟 Équipe mon511.ca" : '🛟 mon511.ca team') : (lang === 'fr' ? 'Toi' : 'You')} — {new Date(r.created_at).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}
                    </div>
                    <div style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{r.message}</div>
                  </div>
                ))}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
