import { useEffect, useState } from 'react';

interface Toast {
  conversationId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl: string | null;
  preview: string;
}

interface Props {
  toast: Toast;
  onReply: () => void;
  onDismiss: () => void;
}

/** Bulle flottante style Teams — apparaît en bas à droite peu importe où
 * l'usager se trouve sur le site, se referme automatiquement après un
 * délai, ou immédiatement au clic (répondre) ou sur le ✕. */
export default function MessageToast({ toast, onReply, onDismiss }: Props) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    const dismissTimer = setTimeout(() => setClosing(true), 8000);
    return () => clearTimeout(dismissTimer);
  }, [toast]);

  useEffect(() => {
    if (!closing) return;
    const removeTimer = setTimeout(onDismiss, 250);
    return () => clearTimeout(removeTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closing]);

  return (
    <div
      onClick={onReply}
      style={{
        position: 'fixed', bottom: 24, right: 24, zIndex: 500, width: 320,
        background: 'var(--panel-solid)', border: '1px solid var(--panel-border)', borderRadius: 14,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)', padding: 14, display: 'flex', gap: 12, alignItems: 'flex-start',
        cursor: 'pointer',
        animation: closing ? 'toast-out 0.25s ease forwards' : 'toast-in 0.25s ease',
      }}
    >
      <div style={{ width: 42, height: 42, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'var(--accent-signal)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, color: '#14161B' }}>
        {toast.senderAvatarUrl ? (
          <img src={toast.senderAvatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        ) : (
          toast.senderName[0]?.toUpperCase()
        )}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{toast.senderName}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {toast.preview}
        </div>
        <div style={{ marginTop: 8, fontSize: 11.5, fontWeight: 600, color: 'var(--accent-signal)' }}>
          Répondre →
        </div>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); setClosing(true); }}
        style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, flexShrink: 0, padding: 2 }}
      >
        ✕
      </button>
    </div>
  );
}
