import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import ConfirmModal from './ConfirmModal';

interface Props {
  onClose: () => void;
  lang: 'fr' | 'en';
  onUnreadCountChange: (count: number) => void;
  startWithUserId?: string | null;
}

export default function MessagingPanel({ onClose, lang, onUnreadCountChange, startWithUserId }: Props) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingBlockUserId, setConfirmingBlockUserId] = useState<string | null>(null);
  const [flaggingMessageId, setFlaggingMessageId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const data = await api.get<any[]>('/messaging/conversations');
      setConversations(data);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    onUnreadCountChange(conversations.reduce((sum, c) => sum + Number(c.unreadCount ?? 0), 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  useEffect(() => {
    if (!startWithUserId) return;
    const existing = conversations.find((c) => c.otherUserId === startWithUserId);
    if (existing) {
      openConversation(existing.conversation_id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startWithUserId, conversations]);

  async function openConversation(id: string) {
    setActiveConversationId(id);
    setError(null);
    const data = await api.get<any[]>(`/messaging/conversations/${id}/messages`);
    setMessages(data);
    setConversations((prev) => prev.map((c) => (c.conversation_id === id ? { ...c, unreadCount: 0 } : c)));
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 50);
  }

  async function send() {
    if (!messageText.trim()) return;
    setSending(true);
    setError(null);
    try {
      if (activeConversationId) {
        const msg = await api.post<any>(`/messaging/conversations/${activeConversationId}/messages`, { message: messageText });
        setMessages((prev) => [...prev, msg]);
      } else if (startWithUserId) {
        const result = await api.post<{ conversationId: string; message: any }>('/messaging/conversations', {
          toUserId: startWithUserId,
          message: messageText,
        });
        setActiveConversationId(result.conversationId);
        setMessages([result.message]);
        load();
      }
      setMessageText('');
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSending(false);
    }
  }

  async function confirmBlock() {
    if (!confirmingBlockUserId) return;
    await api.post(`/messaging/block/${confirmingBlockUserId}`, {}).catch(() => {});
    setConfirmingBlockUserId(null);
    setActiveConversationId(null);
    load();
  }

  async function confirmFlag() {
    if (!flaggingMessageId) return;
    await api.post(`/messaging/messages/${flaggingMessageId}/flag`, {}).catch(() => {});
    setFlaggingMessageId(null);
  }

  const activeConversation = conversations.find((c) => c.conversation_id === activeConversationId);
  const showingNewConversation = !activeConversationId && startWithUserId;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: 460, maxWidth: '95vw', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head">
          <div className="modal-title">
            {activeConversationId || showingNewConversation ? (
              <button className="btn-ghost" style={{ fontSize: 12, marginRight: 8, padding: '4px 8px' }} onClick={() => setActiveConversationId(null)}>
                ← {lang === 'fr' ? 'Retour' : 'Back'}
              </button>
            ) : null}
            {lang === 'fr' ? 'Messages' : 'Messages'}
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', minHeight: 380, maxHeight: '70vh' }}>
          {loading && <div className="center-msg">{lang === 'fr' ? 'Chargement...' : 'Loading...'}</div>}

          {!loading && !activeConversationId && !showingNewConversation && (
            <>
              {conversations.length === 0 && (
                <div className="center-msg">{lang === 'fr' ? 'Aucune conversation pour le moment.' : 'No conversations yet.'}</div>
              )}
              {conversations.map((c) => (
                <div
                  key={c.conversation_id}
                  className="report-card"
                  style={{ cursor: 'pointer' }}
                  onClick={() => openConversation(c.conversation_id)}
                >
                  <div className="rc-icon-hex">
                    {c.otherUserAvatarUrl ? (
                      <img src={c.otherUserAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    ) : (
                      (c.otherUserFirstName?.[0] ?? c.otherUserEmail[0]).toUpperCase()
                    )}
                  </div>
                  <div className="rc-body">
                    <div className="rc-title">{c.otherUserFirstName ? `${c.otherUserFirstName} ${c.otherUserLastName ?? ''}`.trim() : c.otherUserEmail}</div>
                    <div className="rc-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastMessage ?? ''}</div>
                  </div>
                  {Number(c.unreadCount) > 0 && (
                    <span className="badge-dot" style={{ position: 'static', flexShrink: 0 }}>{c.unreadCount}</span>
                  )}
                </div>
              ))}
            </>
          )}

          {(activeConversationId || showingNewConversation) && (
            <>
              {activeConversation && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {activeConversation.otherUserFirstName ? `${activeConversation.otherUserFirstName} ${activeConversation.otherUserLastName ?? ''}`.trim() : activeConversation.otherUserEmail}
                  </div>
                  <button
                    className="btn-ghost"
                    style={{ fontSize: 11, color: 'var(--status-danger, #FF4D5E)' }}
                    onClick={() => setConfirmingBlockUserId(activeConversation.otherUserId)}
                  >
                    🚫 {lang === 'fr' ? 'Bloquer' : 'Block'}
                  </button>
                </div>
              )}

              {error && <div className="error-banner">{error}</div>}

              <div style={{ flex: 1, overflowY: 'auto', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                {messages.map((m) => (
                  <div key={m.id} className="comment">
                    <div className="comment-author" style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                      <span>{new Date(m.created_at).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}</span>
                      <span
                        style={{ cursor: 'pointer', opacity: 0.6 }}
                        title={lang === 'fr' ? 'Signaler ce message' : 'Report this message'}
                        onClick={() => setFlaggingMessageId(m.id)}
                      >
                        🚩
                      </span>
                    </div>
                    {m.message}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <div className="comment-row">
                <input
                  className="text-input"
                  placeholder={lang === 'fr' ? 'Écrire un message...' : 'Write a message...'}
                  value={messageText}
                  onChange={(e) => setMessageText(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()}
                />
                <button className="btn-primary" onClick={send} disabled={sending || !messageText.trim()}>
                  {lang === 'fr' ? 'Envoyer' : 'Send'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {confirmingBlockUserId && (
        <ConfirmModal
          title={lang === 'fr' ? 'Bloquer cet usager ?' : 'Block this user?'}
          message={lang === 'fr' ? "Il ne pourra plus t'envoyer de messages. Tu peux annuler ce blocage plus tard depuis ton profil." : "They won't be able to message you anymore. You can undo this later from your profile."}
          confirmLabel={lang === 'fr' ? 'Bloquer' : 'Block'}
          danger
          onConfirm={confirmBlock}
          onCancel={() => setConfirmingBlockUserId(null)}
        />
      )}

      {flaggingMessageId && (
        <ConfirmModal
          title={lang === 'fr' ? 'Signaler ce message ?' : 'Report this message?'}
          message={lang === 'fr' ? "L'équipe de modération va examiner ce message." : 'The moderation team will review this message.'}
          confirmLabel={lang === 'fr' ? 'Signaler' : 'Report'}
          danger
          onConfirm={confirmFlag}
          onCancel={() => setFlaggingMessageId(null)}
        />
      )}
    </div>
  );
}
