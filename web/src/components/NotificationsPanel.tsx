import { useEffect, useState } from 'react';
import { api } from '../api';

interface Props {
  onClose: () => void;
  lang: 'fr' | 'en';
}

export default function NotificationsPanel({ onClose, lang }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any[]>('/notifications').then((data) => { setItems(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`, {});
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
  }

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: 380 }}>
        <div className="modal-head">
          <div className="modal-title">{lang === 'fr' ? 'Notifications' : 'Notifications'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {loading && <div className="center-msg">{lang === 'fr' ? 'Chargement...' : 'Loading...'}</div>}
          {!loading && items.length === 0 && (
            <div className="center-msg">{lang === 'fr' ? "Aucune notification pour l'instant." : 'No notifications yet.'}</div>
          )}
          {items.map((n) => (
            <div
              key={n.id}
              onClick={() => !n.read_at && markRead(n.id)}
              style={{
                padding: '11px 0', borderBottom: '1px solid var(--panel-border)', cursor: n.read_at ? 'default' : 'pointer',
                opacity: n.read_at ? 0.55 : 1,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                {!n.read_at && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-signal)', marginTop: 5, flexShrink: 0 }} />}
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{n.body}</div>}
                  <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                    {new Date(n.created_at).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
