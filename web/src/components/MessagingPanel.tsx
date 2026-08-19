import { useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { getSocket } from '../socket';
import ConfirmModal from './ConfirmModal';
import { timeAgo } from '../i18n';

interface Props {
  onClose: () => void;
  lang: 'fr' | 'en';
  currentUserId: string | null;
  onUnreadCountChange: (count: number) => void;
  startWithUserId?: string | null;
  onViewProfile: (userId: string) => void;
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
const NEAR_BOTTOM_THRESHOLD = 80;

export default function MessagingPanel({ onClose, lang, currentUserId, onUnreadCountChange, startWithUserId, onViewProfile }: Props) {
  const [conversations, setConversations] = useState<any[]>([]);
  const [onlineFriends, setOnlineFriends] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<'date' | 'name'>('date');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const activeConversationIdRef = useRef<string | null>(null);
  activeConversationIdRef.current = activeConversationId;
  const [messages, setMessages] = useState<any[]>([]);
  const [messageText, setMessageText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingBlockUserId, setConfirmingBlockUserId] = useState<string | null>(null);
  const [flaggingMessageId, setFlaggingMessageId] = useState<string | null>(null);
  const [reactingToMessageId, setReactingToMessageId] = useState<string | null>(null);
  const [showingNewFor, setShowingNewFor] = useState<string | null>(null);
  const [hasNewMessageBelow, setHasNewMessageBelow] = useState(false);
  const [otherIsTyping, setOtherIsTyping] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const isNearBottomRef = useRef(true);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const otherIsTypingRef = useRef(false);
  const lastTypingEmitRef = useRef(0);

  function scrollToBottom(smooth = true) {
    messagesEndRef.current?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto' });
    setHasNewMessageBelow(false);
  }

  function handleMessagesScroll() {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    isNearBottomRef.current = distanceFromBottom < NEAR_BOTTOM_THRESHOLD;
    if (isNearBottomRef.current) setHasNewMessageBelow(false);
  }

  function handleIncomingMessage(isMine: boolean) {
    if (isMine || isNearBottomRef.current) {
      setTimeout(() => scrollToBottom(), 50);
    } else {
      setHasNewMessageBelow(true);
    }
  }

  /** Ouvre le sélecteur rapide de réactions — s'il apparaît près du bas
   * du fil (surtout pour le dernier message), défile légèrement pour le
   * garder entièrement visible plutôt que d'obliger un défilement manuel.
   * Pas nécessaire pour un message plus haut dans l'historique, où il y
   * a déjà de la place en dessous. */
  function openReactionPicker(messageId: string, isNearBottomMessage: boolean) {
    const opening = reactingToMessageId !== messageId;
    setReactingToMessageId(opening ? messageId : null);
    if (opening && isNearBottomMessage) {
      setTimeout(() => scrollToBottom(), 60);
    }
  }

  async function load() {
    try {
      const [convos, friends] = await Promise.all([
        api.get<any[]>('/messaging/conversations'),
        api.get<any[]>('/friends').catch(() => []),
      ]);
      setConversations(convos);
      setOnlineFriends(friends.filter((f) => f.friendOnline));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;

    function handleNewMessage({ conversationId, message }: { conversationId: string; message: any }) {
      if (conversationId === activeConversationIdRef.current) {
        setMessages((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, { ...message, reactions: [] }]));
        setOtherIsTyping(false);
        otherIsTypingRef.current = false;
        handleIncomingMessage(false);
      }
      setConversations((prev) => prev.map((c) => (
        c.conversation_id === conversationId && c.conversation_id !== activeConversationIdRef.current
          ? { ...c, unreadCount: Number(c.unreadCount ?? 0) + 1, lastMessage: message.message, lastMessageAt: message.created_at }
          : c
      )));
    }
    socket.on('new-message', handleNewMessage);

    function handleReaction({ messageId, userId, emoji, added }: { messageId: string; userId: string; emoji: string; added: boolean }) {
      setMessages((prev) => prev.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = added
          ? [...(m.reactions ?? []), { messageId, userId, emoji }]
          : (m.reactions ?? []).filter((r: any) => !(r.userId === userId && r.emoji === emoji));
        return { ...m, reactions };
      }));
    }
    socket.on('message-reaction', handleReaction);

    function handleMessagesRead({ conversationId, messageIds }: { conversationId: string; messageIds: string[] }) {
      if (conversationId !== activeConversationIdRef.current) return;
      setMessages((prev) => prev.map((m) => (messageIds.includes(m.id) ? { ...m, read_at: new Date().toISOString() } : m)));
    }
    socket.on('messages-read', handleMessagesRead);

    function handleUserTyping({ conversationId }: { conversationId: string }) {
      if (conversationId !== activeConversationIdRef.current) return;
      // Seulement si l'usager suivait déjà le bas de la conversation —
      // sinon la bulle "en train d'écrire" pousserait le contenu sans
      // qu'on la voie, obligeant à défiler manuellement à chaque fois
      // pour la retrouver.
      const wasAlreadyTyping = otherIsTypingRef.current;
      setOtherIsTyping(true);
      otherIsTypingRef.current = true;
      if (!wasAlreadyTyping) handleIncomingMessage(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
      typingTimeoutRef.current = setTimeout(() => { setOtherIsTyping(false); otherIsTypingRef.current = false; }, 3000);
    }
    socket.on('user-typing', handleUserTyping);

    return () => {
      socket.off('new-message', handleNewMessage);
      socket.off('message-reaction', handleReaction);
      socket.off('messages-read', handleMessagesRead);
      socket.off('user-typing', handleUserTyping);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      api.get<any[]>('/messaging/conversations').then((data) => {
        setConversations((prev) => {
          if (!activeConversationId) return data;
          return data.map((c) => (c.conversation_id === activeConversationId ? { ...c, unreadCount: 0 } : c));
        });
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [activeConversationId]);

  useEffect(() => {
    onUnreadCountChange(conversations.reduce((sum, c) => sum + Number(c.unreadCount ?? 0), 0));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversations]);

  useEffect(() => {
    if (!startWithUserId) return;
    const existing = conversations.find((c) => c.otherUserId === startWithUserId);
    if (existing) openConversation(existing.conversation_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startWithUserId, conversations]);

  useEffect(() => {
    if (!activeConversationId) return;
    const interval = setInterval(async () => {
      try {
        const data = await api.get<any[]>(`/messaging/conversations/${activeConversationId}/messages`);
        setMessages((prev) => {
          if (data.length === prev.length) return prev;
          handleIncomingMessage(false);
          return data;
        });
      } catch {
        // Silencieux — un échec ponctuel de rafraîchissement en arrière-plan
        // ne doit pas interrompre la conversation en cours.
      }
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversationId]);

  async function openConversation(id: string) {
    setActiveConversationId(id);
    setError(null);
    setOtherIsTyping(false);
    otherIsTypingRef.current = false;
    isNearBottomRef.current = true;
    const data = await api.get<any[]>(`/messaging/conversations/${id}/messages`);
    setMessages(data);
    setConversations((prev) => prev.map((c) => (c.conversation_id === id ? { ...c, unreadCount: 0 } : c)));
    setTimeout(() => scrollToBottom(false), 50);
  }

  function startWithFriend(friendUserId: string) {
    const existing = conversations.find((c) => c.otherUserId === friendUserId);
    if (existing) openConversation(existing.conversation_id);
    else {
      setActiveConversationId(null);
      setShowingNewFor(friendUserId);
    }
  }

  const effectiveNewTargetId = startWithUserId ?? showingNewFor;

  function handleTextChange(value: string) {
    setMessageText(value);
    const targetConversationId = activeConversationId;
    if (!targetConversationId) return;
    const now = Date.now();
    if (now - lastTypingEmitRef.current > 2000) {
      lastTypingEmitRef.current = now;
      getSocket()?.emit('typing', { conversationId: targetConversationId });
    }
  }

  async function send() {
    if (!messageText.trim()) return;
    setSending(true);
    setError(null);
    try {
      if (activeConversationId) {
        const msg = await api.post<any>(`/messaging/conversations/${activeConversationId}/messages`, { message: messageText });
        setMessages((prev) => [...prev, { ...msg, reactions: [] }]);
        handleIncomingMessage(true);
      } else if (effectiveNewTargetId) {
        const result = await api.post<{ conversationId: string; message: any }>('/messaging/conversations', {
          toUserId: effectiveNewTargetId,
          message: messageText,
        });
        setActiveConversationId(result.conversationId);
        setMessages([{ ...result.message, reactions: [] }]);
        setShowingNewFor(null);
        load();
        setTimeout(() => scrollToBottom(false), 50);
      }
      setMessageText('');
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

  async function toggleReaction(messageId: string, emoji: string) {
    setReactingToMessageId(null);
    const result = await api.post<{ added: boolean }>(`/messaging/messages/${messageId}/react`, { emoji }).catch(() => null);
    if (!result || !currentUserId) return;
    setMessages((prev) => prev.map((m) => {
      if (m.id !== messageId) return m;
      const reactions = result.added
        ? [...(m.reactions ?? []), { messageId, userId: currentUserId, emoji }]
        : (m.reactions ?? []).filter((r: any) => !(r.userId === currentUserId && r.emoji === emoji));
      return { ...m, reactions };
    }));
  }

  const activeConversation = conversations.find((c) => c.conversation_id === activeConversationId);
  const showingNewConversation = !activeConversationId && !!effectiveNewTargetId;

  const sortedConversations = [...conversations].sort((a, b) => {
    if (sortBy === 'name') return (a.otherUserDisplayName ?? '').localeCompare(b.otherUserDisplayName ?? '', 'fr-CA');
    return new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime();
  });

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: 460, maxWidth: '95vw', display: 'flex', flexDirection: 'column' }}>
        <div className="modal-head">
          <div className="modal-title">
            {activeConversationId || showingNewConversation ? (
              <button className="btn-ghost" style={{ fontSize: 12, marginRight: 8, padding: '4px 8px' }} onClick={() => { setActiveConversationId(null); setShowingNewFor(null); }}>
                ← {lang === 'fr' ? 'Retour' : 'Back'}
              </button>
            ) : null}
            {lang === 'fr' ? 'Messages' : 'Messages'}
          </div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', height: '72vh', overflow: 'hidden' }}>
          {error && !activeConversationId && !showingNewConversation && <div className="error-banner" style={{ flexShrink: 0 }}>{error}</div>}
          {loading && <div className="center-msg">{lang === 'fr' ? 'Chargement...' : 'Loading...'}</div>}

          {!loading && !activeConversationId && !showingNewConversation && (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              {onlineFriends.length > 0 && (
                <div style={{ display: 'flex', gap: 12, overflowX: 'auto', paddingBottom: 12, marginBottom: 12, borderBottom: '1px solid var(--panel-border)' }}>
                  {onlineFriends.map((f) => (
                    <div
                      key={f.friendUserId}
                      onClick={() => startWithFriend(f.friendUserId)}
                      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0, width: 52 }}
                      title={f.friendDisplayName}
                    >
                      <div style={{ position: 'relative', width: 42, height: 42 }}>
                        <div className="rc-icon-hex" style={{ width: 42, height: 42, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onViewProfile(f.friendUserId); }}>
                          {f.friendAvatarUrl ? (
                            <img src={f.friendAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                          ) : (
                            (f.friendDisplayName?.[0] ?? '?').toUpperCase()
                          )}
                        </div>
                        <span style={{
                          position: 'absolute', bottom: -1, right: -1, width: 12, height: 12, borderRadius: '50%',
                          background: '#3BD16F', border: '2px solid var(--panel-solid)',
                        }} />
                      </div>
                      <div style={{ fontSize: 9.5, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', textAlign: 'center' }}>
                        {f.friendDisplayName?.split(' ')[0]}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {conversations.length > 1 && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 10, fontSize: 11 }}>
                  <span style={{ color: 'var(--text-muted)', alignSelf: 'center' }}>{lang === 'fr' ? 'Trier :' : 'Sort:'}</span>
                  <button className={`btn-ghost ${sortBy === 'date' ? 'active' : ''}`} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setSortBy('date')}>
                    {lang === 'fr' ? 'Date' : 'Date'}
                  </button>
                  <button className={`btn-ghost ${sortBy === 'name' ? 'active' : ''}`} style={{ padding: '4px 10px', fontSize: 11 }} onClick={() => setSortBy('name')}>
                    {lang === 'fr' ? 'Nom' : 'Name'}
                  </button>
                </div>
              )}

              {conversations.length === 0 && (
                <div className="center-msg">{lang === 'fr' ? 'Aucune conversation pour le moment.' : 'No conversations yet.'}</div>
              )}
              {sortedConversations.map((c) => (
                <div
                  key={c.conversation_id}
                  className="report-card"
                  style={{ cursor: 'pointer' }}
                  onClick={() => openConversation(c.conversation_id)}
                >
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div className="rc-icon-hex" onClick={(e) => { e.stopPropagation(); onViewProfile(c.otherUserId); }}>
                      {c.otherUserAvatarUrl ? (
                        <img src={c.otherUserAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      ) : (
                        (c.otherUserDisplayName?.[0] ?? c.otherUserEmail[0]).toUpperCase()
                      )}
                    </div>
                    {c.otherUserOnline && (
                      <span style={{
                        position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: '50%',
                        background: '#3BD16F', border: '2px solid var(--panel-solid)',
                      }} />
                    )}
                  </div>
                  <div className="rc-body">
                    <div className="rc-title">{c.otherUserDisplayName}</div>
                    <div className="rc-meta" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.lastMessage ?? ''}</div>
                  </div>
                  {Number(c.unreadCount) > 0 && (
                    <span className="badge-dot" style={{ position: 'static', flexShrink: 0 }}>{c.unreadCount}</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {(activeConversationId || showingNewConversation) && (
            <>
              {activeConversation && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, flexShrink: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ position: 'relative', width: 30, height: 30, flexShrink: 0 }}>
                      <div className="rc-icon-hex" style={{ width: 30, height: 30, cursor: 'pointer' }} onClick={() => onViewProfile(activeConversation.otherUserId)}>
                        {activeConversation.otherUserAvatarUrl ? (
                          <img src={activeConversation.otherUserAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                        ) : (
                          (activeConversation.otherUserDisplayName?.[0] ?? activeConversation.otherUserEmail[0]).toUpperCase()
                        )}
                      </div>
                      {activeConversation.otherUserOnline && (
                        <span style={{
                          position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%',
                          background: '#3BD16F', border: '2px solid var(--panel-solid)',
                        }} />
                      )}
                    </div>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, cursor: 'pointer' }} onClick={() => onViewProfile(activeConversation.otherUserId)}>{activeConversation.otherUserDisplayName}</div>
                      {otherIsTyping && (
                        <div style={{ fontSize: 10.5, color: 'var(--accent-signal)' }}>
                          {lang === 'fr' ? 'écrit...' : 'typing...'}
                        </div>
                      )}
                    </div>
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

              {error && <div className="error-banner" style={{ flexShrink: 0 }}>{error}</div>}

              <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
                <div
                  ref={messagesContainerRef}
                  onScroll={handleMessagesScroll}
                  style={{ height: '100%', overflowY: 'auto', marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 3, padding: '4px 2px' }}
                >
                  {messages.map((m, i) => {
                    const isMine = m.senderId === currentUserId;
                    // Les 2 derniers messages sont assez proches du bas pour
                    // que le sélecteur de réactions risque de déborder de la
                    // zone visible — un défilement léger est justifié pour
                    // ceux-là ; plus haut dans l'historique, il y a
                    // généralement déjà assez de place en dessous.
                    const isNearBottomMessage = i >= messages.length - 2;
                    const groupedReactions = (m.reactions ?? []).reduce((acc: Record<string, number>, r: any) => {
                      acc[r.emoji] = (acc[r.emoji] ?? 0) + 1;
                      return acc;
                    }, {});
                    return (
                      <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isMine ? 'flex-end' : 'flex-start', position: 'relative' }}>
                        <div
                          style={{
                            maxWidth: '75%', padding: '9px 13px', borderRadius: 18,
                            background: isMine ? 'var(--accent-signal)' : 'var(--panel-hover)',
                            color: isMine ? '#14161B' : 'var(--text-body)',
                            fontSize: 13.5, lineHeight: 1.4, wordBreak: 'break-word', cursor: 'pointer',
                            borderBottomRightRadius: isMine ? 5 : 18, borderBottomLeftRadius: isMine ? 18 : 5,
                          }}
                          onDoubleClick={() => openReactionPicker(m.id, isNearBottomMessage)}
                        >
                          {m.message}
                        </div>

                        {Object.keys(groupedReactions).length > 0 && (
                          <div style={{ display: 'flex', gap: 3, marginTop: -6, marginBottom: 4, background: 'var(--panel-solid)', borderRadius: 10, padding: '2px 6px', border: '1px solid var(--panel-border)' }}>
                            {Object.entries(groupedReactions).map(([emoji, count]) => (
                              <span key={emoji} style={{ fontSize: 11 }}>{emoji}{Number(count) > 1 ? Number(count) : ''}</span>
                            ))}
                          </div>
                        )}

                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 9.5, color: 'var(--text-muted)', marginTop: 2 }}>
                          <span>{timeAgo(m.created_at, lang)}</span>
                          {isMine && (
                            <span title={m.read_at ? (lang === 'fr' ? 'Lu' : 'Read') : (lang === 'fr' ? 'Envoyé' : 'Sent')} style={{ color: m.read_at ? 'var(--accent-signal)' : 'var(--text-muted)' }}>
                              {m.read_at ? '✓✓' : '✓'}
                            </span>
                          )}
                          <span style={{ cursor: 'pointer' }} onClick={() => openReactionPicker(m.id, isNearBottomMessage)}>😊</span>
                          {!isMine && (
                            <span style={{ cursor: 'pointer' }} title={lang === 'fr' ? 'Signaler' : 'Report'} onClick={() => setFlaggingMessageId(m.id)}>🚩</span>
                          )}
                        </div>

                        {reactingToMessageId === m.id && (
                          <div style={{ display: 'flex', gap: 4, background: 'var(--panel-solid)', border: '1px solid var(--panel-border)', borderRadius: 20, padding: '4px 8px', marginTop: 2, boxShadow: 'var(--shadow-panel)' }}>
                            {QUICK_EMOJIS.map((emoji) => (
                              <span key={emoji} style={{ cursor: 'pointer', fontSize: 15 }} onClick={() => toggleReaction(m.id, emoji)}>{emoji}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {otherIsTyping && (
                    <div style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 4, padding: '10px 14px', background: 'var(--panel-hover)', borderRadius: 18, borderBottomLeftRadius: 5 }}>
                      <span className="typing-dot" style={{ animationDelay: '0s' }} />
                      <span className="typing-dot" style={{ animationDelay: '0.15s' }} />
                      <span className="typing-dot" style={{ animationDelay: '0.3s' }} />
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {hasNewMessageBelow && (
                  <button
                    onClick={() => scrollToBottom()}
                    style={{
                      position: 'absolute', bottom: 10, left: '50%', transform: 'translateX(-50%)',
                      width: 38, height: 38, borderRadius: '50%', background: 'var(--accent-signal)', color: '#14161B',
                      border: 'none', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                      boxShadow: '0 4px 14px rgba(0,0,0,0.35)', animation: 'new-message-bounce 1.1s ease-in-out infinite',
                    }}
                    title={lang === 'fr' ? 'Nouveau message' : 'New message'}
                  >
                    ↓
                  </button>
                )}
              </div>

              <div className="comment-row" style={{ flexShrink: 0 }}>
                <input
                  className="text-input"
                  placeholder={lang === 'fr' ? 'Écrire un message...' : 'Write a message...'}
                  value={messageText}
                  onChange={(e) => handleTextChange(e.target.value)}
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
