import { useEffect, useState } from 'react';
import { api } from '../api';

interface Props {
  onClose: () => void;
  lang: 'fr' | 'en';
  prefill?: { subject: string; description: string } | null;
}

const STATUS_LABELS: Record<string, [string, string]> = {
  open: ['Ouvert', 'Open'],
  in_progress: ['En traitement', 'In progress'],
  resolved: ['Résolu', 'Resolved'],
};

export default function SupportTicketsModal({ onClose, lang, prefill }: Props) {
  const [tickets, setTickets] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ ticket: any; replies: any[]; attachments: any[] } | null>(null);
  const [creating, setCreating] = useState(!!prefill);
  const [subject, setSubject] = useState(prefill?.subject ?? '');
  const [description, setDescription] = useState(prefill?.description ?? '');
  const [email, setEmail] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (!subject.trim() || !description.trim() || !email.trim()) {
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
      await api.post('/support/tickets', { email, subject, description, attachments });
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
                <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {t.subject}
                </div>
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)' }}>
                  {(STATUS_LABELS[t.status] ?? [t.status, t.status])[lang === 'fr' ? 0 : 1]} · {new Date(t.created_at).toLocaleDateString(lang === 'fr' ? 'fr-CA' : 'en-CA')}
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
                <div className="field-group">
                  <label className="field-label">{lang === 'fr' ? 'Ton courriel' : 'Your email'}</label>
                  <input className="text-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
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
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>
                  {lang === 'fr' ? 'Numéro du billet' : 'Ticket ID'} : <code>{detail.ticket.id}</code>
                </div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 14 }}>
                  {(STATUS_LABELS[detail.ticket.status] ?? [detail.ticket.status, detail.ticket.status])[lang === 'fr' ? 0 : 1]}
                </div>
                <div style={{ fontSize: 13, lineHeight: 1.6, whiteSpace: 'pre-wrap', marginBottom: 16 }}>
                  {detail.ticket.description}
                </div>
                {detail.attachments.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    {detail.attachments.map((a) => (
                      <a key={a.id} href={a.url} target="_blank" rel="noreferrer" style={{ display: 'block', fontSize: 12, color: 'var(--accent-signal)', marginBottom: 4 }}>
                        📎 {a.filename}
                      </a>
                    ))}
                  </div>
                )}
                {detail.replies.map((r) => (
                  <div key={r.id} style={{ padding: 12, borderRadius: 10, background: 'var(--panel-hover)', marginBottom: 10 }}>
                    <div style={{ fontSize: 10.5, color: 'var(--text-muted)', marginBottom: 4 }}>
                      {r.author_type === 'admin' ? (lang === 'fr' ? "Équipe mon511.ca" : 'mon511.ca team') : (lang === 'fr' ? 'Toi' : 'You')} — {new Date(r.created_at).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}
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
