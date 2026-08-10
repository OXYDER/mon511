import { useEffect, useState } from 'react';
import { api } from '../api';
import { pickName } from '../i18n';

interface Props {
  onClose: () => void;
  lang: 'fr' | 'en';
  onOpenReport: (reportId: string) => void;
  onUnreadCountChange: (count: number) => void;
}

export default function NotificationsPanel({ onClose, lang, onOpenReport, onUnreadCountChange }: Props) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<any[]>('/notifications').then((data) => { setItems(data); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  // Garde la bulle de compte non lu dans la barre du haut synchronisée en
  // direct — sans ça, elle ne se mettait à jour qu'en fermant puis
  // rouvrant le panneau.
  useEffect(() => {
    onUnreadCountChange(items.filter((n) => !n.readAt).length);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  async function markRead(id: string) {
    await api.patch(`/notifications/${id}/read`, {});
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
  }

  async function markAllRead() {
    await api.patch('/notifications/read-all', {});
    setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })));
  }

  function handleClick(n: any) {
    if (!n.readAt) markRead(n.id);
    if (n.reportId) {
      onOpenReport(n.reportId);
      onClose();
    }
  }

  const unreadCount = items.filter((n) => !n.readAt).length;

  return (
    <div className="modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-box" style={{ width: 400 }}>
        <div className="modal-head">
          <div className="modal-title">{lang === 'fr' ? 'Notifications' : 'Notifications'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          {unreadCount > 0 && (
            <button className="btn-ghost" style={{ width: '100%', marginBottom: 12, fontSize: 12 }} onClick={markAllRead}>
              ✓ {lang === 'fr' ? `Tout marquer comme lu (${unreadCount})` : `Mark all as read (${unreadCount})`}
            </button>
          )}
          {loading && <div className="center-msg">{lang === 'fr' ? 'Chargement...' : 'Loading...'}</div>}
          {!loading && items.length === 0 && (
            <div className="center-msg">{lang === 'fr' ? "Aucune notification pour l'instant." : 'No notifications yet.'}</div>
          )}
          {items.map((n) => (
            <div
              key={n.id}
              onClick={() => handleClick(n)}
              style={{
                padding: '11px 0', borderBottom: '1px solid var(--panel-border)', cursor: 'pointer',
                opacity: n.readAt ? 0.55 : 1, display: 'flex', gap: 10, alignItems: 'flex-start',
              }}
            >
              {!n.readAt && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent-signal)', marginTop: 5, flexShrink: 0 }} />}
              {n.reportThumbnailUrl && (
                <img
                  src={n.reportThumbnailUrl}
                  alt=""
                  style={{ width: 40, height: 40, objectFit: 'cover', borderRadius: 7, flexShrink: 0 }}
                />
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 2 }}>{n.title}</div>
                {n.body && <div style={{ fontSize: 11.5, color: 'var(--text-muted)', lineHeight: 1.5 }}>{n.body}</div>}
                {n.reportProblemTypeNameFr && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>{n.reportProblemTypeIcon ?? '📍'}</span>
                    <span>{pickName(n.reportProblemTypeNameFr, n.reportProblemTypeNameEn, lang)}</span>
                    {n.reportAddressText && <span>— {n.reportAddressText}</span>}
                  </div>
                )}
                <div style={{ fontSize: 10.5, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 4 }}>
                  {new Date(n.createdAt).toLocaleString(lang === 'fr' ? 'fr-CA' : 'en-CA')}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
