import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

interface Props {
  onClose: () => void;
  lang: 'fr' | 'en';
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const SESSION_KEY = 'mon511_support_session';

function getOrCreateSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export default function SupportChatWidget({ onClose, lang }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [escalateSuggested, setEscalateSuggested] = useState(false);
  const [ticketCreated, setTicketCreated] = useState(false);
  const [creatingTicket, setCreatingTicket] = useState(false);
  const [needsEmail, setNeedsEmail] = useState(false);
  const [email, setEmail] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionId = getOrCreateSessionId();

  useEffect(() => {
    api.get<{ conversationId: string | null; messages: any[] }>(`/support/chat/history?sessionId=${sessionId}`)
      .then((data) => setMessages(data.messages.map((m) => ({ role: m.role, content: m.content }))))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setSending(true);
    try {
      const result = await api.post<{ reply: string; escalate: boolean }>('/support/chat/message', {
        sessionId,
        email: email || undefined,
        message: text,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }]);
      // On propose seulement — jamais de création automatique. L'usager
      // décide lui-même via les boutons Oui/Non ci-dessous.
      setEscalateSuggested(result.escalate);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: lang === 'fr' ? "Une erreur est survenue. Réessaie dans un instant." : 'Something went wrong. Please try again in a moment.' }]);
    } finally {
      setSending(false);
    }
  }

  async function confirmTicket() {
    if (!email) { setNeedsEmail(true); return; }
    setCreatingTicket(true);
    try {
      await api.post('/support/chat/confirm-ticket', { sessionId, email });
      setTicketCreated(true);
      setEscalateSuggested(false);
      setNeedsEmail(false);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: lang === 'fr' ? "Impossible de créer le ticket pour l'instant — réessaie dans un moment." : 'Could not create the ticket right now — please try again shortly.' }]);
    } finally {
      setCreatingTicket(false);
    }
  }

  function declineTicket() {
    setEscalateSuggested(false);
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: 400, display: 'flex', flexDirection: 'column', height: 560 }}>
        <div className="modal-head">
          <div className="modal-title">💬 {lang === 'fr' ? 'Support mon511.ca' : 'mon511.ca support'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center', marginTop: 20 }}>
              {lang === 'fr'
                ? "Pose ta question — je connais bien le fonctionnement de mon511.ca et je peux t'aider directement, ou créer un ticket pour notre équipe au besoin."
                : "Ask your question — I know how mon511.ca works and can help directly, or create a ticket for our team if needed."}
            </div>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              style={{
                alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
                background: m.role === 'user' ? 'var(--accent-signal)' : 'var(--panel-hover)',
                color: m.role === 'user' ? '#14161B' : 'var(--text-body)',
                borderRadius: 12, padding: '9px 13px', fontSize: 13, lineHeight: 1.5, maxWidth: '85%',
                whiteSpace: 'pre-wrap',
              }}
            >
              {m.content}
            </div>
          ))}
          {sending && (
            <div style={{ alignSelf: 'flex-start', fontSize: 12, color: 'var(--text-muted)' }}>
              {lang === 'fr' ? 'Un instant...' : 'One moment...'}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {ticketCreated && (
          <div className="success-banner" style={{ margin: '0 20px 12px' }}>
            {lang === 'fr'
              ? 'Un ticket a été créé — notre équipe va te répondre par courriel sous peu.'
              : "A ticket has been created — our team will reply by email shortly."}
          </div>
        )}

        {escalateSuggested && !ticketCreated && !needsEmail && (
          <div style={{ margin: '0 20px 12px', padding: 12, borderRadius: 10, background: 'var(--panel-hover)' }}>
            <div style={{ fontSize: 12, marginBottom: 8 }}>
              {lang === 'fr'
                ? "Veux-tu que je crée un ticket pour que notre équipe s'en occupe directement?"
                : 'Would you like me to create a ticket so our team can help you directly?'}
            </div>
            <div className="action-row" style={{ margin: 0 }}>
              <button className="btn-primary" style={{ width: 'auto' }} onClick={confirmTicket} disabled={creatingTicket}>
                {creatingTicket ? (lang === 'fr' ? 'Création...' : 'Creating...') : (lang === 'fr' ? 'Oui, créer un ticket' : 'Yes, create a ticket')}
              </button>
              <button className="btn-ghost" onClick={declineTicket}>
                {lang === 'fr' ? 'Non merci' : 'No thanks'}
              </button>
            </div>
          </div>
        )}

        {needsEmail && !ticketCreated && (
          <div style={{ margin: '0 20px 12px' }} className="field-group">
            <label className="field-label">{lang === 'fr' ? 'Ton courriel (pour te répondre)' : 'Your email (so we can reply)'}</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input className="text-input" style={{ flex: 1, minWidth: 0 }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="btn-primary" style={{ width: 'auto', flexShrink: 0 }} onClick={confirmTicket} disabled={creatingTicket || !email.trim()}>
                {creatingTicket ? '...' : (lang === 'fr' ? 'Confirmer' : 'Confirm')}
              </button>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, padding: '0 20px 20px' }}>
          <input
            className="text-input"
            style={{ flex: 1, minWidth: 0 }}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder={lang === 'fr' ? 'Écris ton message...' : 'Type your message...'}
            disabled={sending}
          />
          <button className="btn-primary" style={{ width: 'auto', flexShrink: 0, whiteSpace: 'nowrap' }} onClick={send} disabled={sending || !input.trim()}>
            {lang === 'fr' ? 'Envoyer' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
