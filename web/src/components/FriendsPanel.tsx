import { useEffect, useState } from 'react';
import { api } from '../api';
import ConfirmModal from './ConfirmModal';

interface Props {
  onClose: () => void;
  lang: 'fr' | 'en';
  onOpenConversation: (userId: string) => void;
  onViewProfile: (userId: string) => void;
}

export default function FriendsPanel({ onClose, lang, onOpenConversation, onViewProfile }: Props) {
  const [friends, setFriends] = useState<any[]>([]);
  const [received, setReceived] = useState<any[]>([]);
  const [sent, setSent] = useState<any[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingRemoveId, setConfirmingRemoveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [f, r, s] = await Promise.all([
        api.get<any[]>('/friends'),
        api.get<any[]>('/friends/requests/received'),
        api.get<any[]>('/friends/requests/sent'),
      ]);
      setFriends(f);
      setReceived(r);
      setSent(s);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur de chargement.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function sendRequest() {
    if (!emailInput.trim()) return;
    setSending(true);
    setFeedback(null);
    setError(null);
    try {
      await api.post('/friends/requests', { email: emailInput.trim() });
      setFeedback(lang === 'fr' ? 'Demande envoyée !' : 'Request sent!');
      setEmailInput('');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSending(false);
    }
  }

  async function accept(id: string) {
    await api.post(`/friends/requests/${id}/accept`, {}).catch(() => {});
    load();
  }

  async function decline(id: string) {
    await api.post(`/friends/requests/${id}/decline`, {}).catch(() => {});
    load();
  }

  async function confirmRemove() {
    if (!confirmingRemoveId) return;
    await api.delete(`/friends/${confirmingRemoveId}`).catch(() => {});
    setConfirmingRemoveId(null);
    load();
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: 420, maxWidth: '95vw' }}>
        <div className="modal-head">
          <div className="modal-title">{lang === 'fr' ? 'Amis' : 'Friends'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body" style={{ maxHeight: '75vh', overflowY: 'auto' }}>
          {feedback && <div className="success-banner">{feedback}</div>}
          {error && <div className="error-banner">{error}</div>}

          <div className="field-group">
            <label className="field-label">
              {lang === 'fr' ? "Ajouter un ami par courriel" : 'Add a friend by email'}
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                className="text-input"
                type="email"
                placeholder="courriel@exemple.com"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendRequest()}
              />
              <button className="btn-primary" style={{ width: 'auto', flexShrink: 0 }} onClick={sendRequest} disabled={sending}>
                {sending ? '...' : (lang === 'fr' ? 'Ajouter' : 'Add')}
              </button>
            </div>
          </div>

          {loading && <div className="center-msg">{lang === 'fr' ? 'Chargement...' : 'Loading...'}</div>}

          {!loading && received.length > 0 && (
            <>
              <div className="section-label" style={{ fontSize: 13 }}>
                {lang === 'fr' ? `Demandes reçues (${received.length})` : `Received requests (${received.length})`}
              </div>
              {received.map((r) => (
                <div key={r.friendshipId} className="report-card" style={{ cursor: 'default' }}>
                  <div className="rc-icon-hex" style={{ cursor: 'pointer' }} onClick={() => onViewProfile(r.fromUserId)}>
                    {r.fromAvatarUrl ? (
                      <img src={r.fromAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                    ) : (
                      (r.fromDisplayName?.[0] ?? '?').toUpperCase()
                    )}
                  </div>
                  <div className="rc-body">
                    <div className="rc-title">{r.fromDisplayName}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-primary" style={{ width: 'auto', fontSize: 11, padding: '6px 10px' }} onClick={() => accept(r.friendshipId)}>
                      {lang === 'fr' ? 'Accepter' : 'Accept'}
                    </button>
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => decline(r.friendshipId)}>
                      {lang === 'fr' ? 'Refuser' : 'Decline'}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {!loading && (
            <>
              <div className="section-label" style={{ fontSize: 13 }}>
                {lang === 'fr' ? `Mes amis (${friends.length})` : `My friends (${friends.length})`}
              </div>
              {friends.length === 0 && (
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                  {lang === 'fr' ? 'Aucun ami pour le moment — ajoute-en un ci-dessus par courriel.' : 'No friends yet — add one above by email.'}
                </div>
              )}
              {friends.map((f) => (
                <div key={f.friendshipId} className="report-card" style={{ cursor: 'default' }}>
                  <div style={{ position: 'relative', flexShrink: 0 }}>
                    <div className="rc-icon-hex" style={{ cursor: 'pointer' }} onClick={() => onViewProfile(f.friendUserId)}>
                      {f.friendAvatarUrl ? (
                        <img src={f.friendAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }} />
                      ) : (
                        (f.friendDisplayName?.[0] ?? '?').toUpperCase()
                      )}
                    </div>
                    {f.friendOnline && (
                      <span style={{
                        position: 'absolute', bottom: -1, right: -1, width: 11, height: 11, borderRadius: '50%',
                        background: '#3BD16F', border: '2px solid var(--panel-solid)',
                      }} />
                    )}
                  </div>
                  <div className="rc-body">
                    <div className="rc-title">{f.friendDisplayName}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => { onOpenConversation(f.friendUserId); onClose(); }}>
                      💬
                    </button>
                    <button className="btn-ghost btn-danger" style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => setConfirmingRemoveId(f.friendshipId)}>
                      {lang === 'fr' ? 'Retirer' : 'Remove'}
                    </button>
                  </div>
                </div>
              ))}
            </>
          )}

          {!loading && sent.length > 0 && (
            <>
              <div className="section-label" style={{ fontSize: 13 }}>
                {lang === 'fr' ? `Demandes envoyées (${sent.length})` : `Sent requests (${sent.length})`}
              </div>
              {sent.map((s) => (
                <div key={s.friendshipId} className="report-card" style={{ cursor: 'default' }}>
                  <div className="rc-body">
                    <div className="rc-title" style={{ fontSize: 12.5 }}>{s.toEmail}</div>
                    <div className="rc-meta">{lang === 'fr' ? 'En attente' : 'Pending'}</div>
                  </div>
                  <button className="btn-ghost" style={{ fontSize: 11, padding: '6px 10px' }} onClick={() => setConfirmingRemoveId(s.friendshipId)}>
                    {lang === 'fr' ? 'Annuler' : 'Cancel'}
                  </button>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {confirmingRemoveId && (
        <ConfirmModal
          title={lang === 'fr' ? 'Confirmer ?' : 'Confirm?'}
          message={lang === 'fr' ? 'Cette action est immédiate.' : 'This action is immediate.'}
          confirmLabel={lang === 'fr' ? 'Confirmer' : 'Confirm'}
          danger
          onConfirm={confirmRemove}
          onCancel={() => setConfirmingRemoveId(null)}
        />
      )}
    </div>
  );
}
