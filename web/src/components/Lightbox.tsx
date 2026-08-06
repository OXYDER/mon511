import { createPortal } from 'react-dom';

interface Props {
  src: string;
  onClose: () => void;
}

export default function Lightbox({ src, onClose }: Props) {
  // Rendu via portail directement dans <body> — nécessaire car le panneau
  // de détail parent a un backdrop-filter (flou d'arrière-plan), ce qui crée
  // un nouveau "containing block" en CSS et piège les éléments position:fixed
  // à l'intérieur de ses propres limites plutôt que de couvrir tout l'écran.
  return createPortal(
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(10,11,14,0.85)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'zoom-out',
        padding: 24,
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 20, right: 24, background: 'none', border: 'none',
          color: '#fff', fontSize: 28, cursor: 'pointer', lineHeight: 1,
        }}
      >
        ✕
      </button>
      <img
        src={src}
        alt="Photo agrandie"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '92vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 10, cursor: 'default' }}
      />
    </div>,
    document.body,
  );
}
