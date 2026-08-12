import { useEffect, useRef, useState } from 'react';
import { api } from '../api';

interface Props {
  onClose: () => void;
  lang: 'fr' | 'en';
  onOpenTicketForm: (prefill: { subject: string; description: string }) => void;
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

export default function SupportChatWidget({ onClose, lang, onOpenTicketForm }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [escalateSuggested, setEscalateSuggested] = useState(false);
  const [preparingTicket, setPreparingTicket] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionId = getOrCreateSessionId();

  function loadHistory() {
    api.get<{ conversationId: string | null; messages: any[] }>(`/support/chat/history?sessionId=${sessionId}`)
      .then((data) => setMessages(data.messages.map((m) => ({ role: m.role, content: m.content }))))
      .catch(() => {});
  }

  useEffect(() => {
    loadHistory();
    // Marque la conversation comme vue à l'ouverture — fait taire le
    // flash de l'icône Aide s'il était allumé pour une réponse ici.
    api.post('/support/chat/seen', { sessionId }).catch(() => {});
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
        message: text,
      });
      setMessages((prev) => [...prev, { role: 'assistant', content: result.reply }]);
      setEscalateSuggested(result.escalate);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: lang === 'fr' ? "Une erreur est survenue. Réessaie dans un instant." : 'Something went wrong. Please try again in a moment.' }]);
    } finally {
      setSending(false);
    }
  }

  async function resetChat() {
    await api.post('/support/chat/reset', { sessionId }).catch(() => {});
    setMessages([]);
    setEscalateSuggested(false);
    setInput('');
  }

  async function goToTicketForm() {
    setPreparingTicket(true);
    try {
      const prefill = await api.post<{ subject: string; description: string }>('/support/chat/prepare-ticket', { sessionId });
      onOpenTicketForm(prefill);
      onClose();
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: lang === 'fr' ? "Impossible de préparer le ticket pour l'instant — réessaie dans un moment." : 'Could not prepare the ticket right now — please try again shortly.' }]);
    } finally {
      setPreparingTicket(false);
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {messages.length > 0 && (
              <button
                onClick={resetChat}
                title={lang === 'fr' ? 'Réinitialiser le chat' : 'Reset chat'}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12 }}
              >
                ↺ {lang === 'fr' ? 'Réinitialiser' : 'Reset'}
              </button>
            )}
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {messages.length === 0 && (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', textAlign: 'center', marginTop: 20 }}>
              {lang === 'fr'
                ? "Pose ta question — je connais bien le fonctionnement de mon511.ca et je peux t'aider directement, ou te diriger vers un ticket pour notre équipe au besoin."
                : "Ask your question — I know how mon511.ca works and can help directly, or point you to a ticket for our team if needed."}
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

        {escalateSuggested && (
          <div style={{ margin: '0 20px 12px', padding: 12, borderRadius: 10, background: 'var(--panel-hover)' }}>
            <div style={{ fontSize: 12, marginBottom: 8 }}>
              {lang === 'fr'
                ? "Veux-tu ouvrir un ticket pour que notre équipe s'en occupe directement?"
                : 'Would you like to open a ticket so our team can help you directly?'}
            </div>
            <div className="action-row" style={{ margin: 0 }}>
              <button className="btn-primary" style={{ width: 'auto' }} onClick={goToTicketForm} disabled={preparingTicket}>
                {preparingTicket ? (lang === 'fr' ? 'Un instant...' : 'One moment...') : (lang === 'fr' ? 'Oui, créer un ticket' : 'Yes, create a ticket')}
              </button>
              <button className="btn-ghost" onClick={declineTicket}>
                {lang === 'fr' ? 'Non merci' : 'No thanks'}
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
