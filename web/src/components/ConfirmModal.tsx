import { createPortal } from 'react-dom';

interface Props {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Remplace window.confirm() — le dialogue natif du navigateur peut être
 * définitivement désactivé par l'usager (case "ne plus afficher"), ce qui
 * ferait alors passer une action irréversible SANS AUCUNE confirmation.
 * Une modale entièrement gérée par notre propre code ne peut pas être
 * désactivée de cette façon. */
export default function ConfirmModal({ title, message, confirmLabel, cancelLabel, danger, onConfirm, onCancel }: Props) {
  return createPortal(
    <div className="modal-overlay" onClick={onCancel} style={{ zIndex: 400 }}>
      <div className="modal-card" style={{ maxWidth: 400 }} onClick={(e) => e.stopPropagation()}>
        <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{title}</div>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: 20 }}>{message}</p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button className="btn-ghost" onClick={onCancel}>{cancelLabel ?? 'Annuler'}</button>
          <button className={danger ? 'btn-ghost btn-danger' : 'btn-primary'} onClick={onConfirm}>
            {confirmLabel ?? 'Confirmer'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
