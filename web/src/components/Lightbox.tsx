interface Props {
  src: string;
  onClose: () => void;
}

export default function Lightbox({ src, onClose }: Props) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(10,11,14,0.85)',
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
    </div>
  );
}
