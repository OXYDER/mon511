import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface Props {
  photos: string[];
  initialIndex: number;
  onClose: () => void;
}

export default function Lightbox({ photos, initialIndex, onClose }: Props) {
  const [index, setIndex] = useState(initialIndex);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ startX: number; startY: number; panX: number; panY: number } | null>(null);
  const pinchRef = useRef<{ startDist: number; startZoom: number } | null>(null);

  function resetZoom() {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }

  function go(delta: number) {
    resetZoom();
    setIndex((i) => (i + delta + photos.length) % photos.length);
  }

  // Navigation et fermeture au clavier — pratique sur ordinateur, pas
  // obligé de cliquer sur les petites flèches.
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowLeft' && photos.length > 1) go(-1);
      else if (e.key === 'ArrowRight' && photos.length > 1) go(1);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photos.length]);

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault();
    setZoom((z) => Math.min(4, Math.max(1, z - e.deltaY * 0.0015)));
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (zoom <= 1) return;
    dragRef.current = { startX: e.clientX, startY: e.clientY, panX: pan.x, panY: pan.y };
  }
  function handleMouseMove(e: React.MouseEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
  }
  function handleMouseUp() {
    dragRef.current = null;
  }

  function touchDist(touches: React.TouchList) {
    const dx = touches[0].clientX - touches[1].clientX;
    const dy = touches[0].clientY - touches[1].clientY;
    return Math.hypot(dx, dy);
  }
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  function handleTouchStart(e: React.TouchEvent) {
    if (e.touches.length === 2) {
      pinchRef.current = { startDist: touchDist(e.touches), startZoom: zoom };
    } else if (e.touches.length === 1 && zoom > 1) {
      dragRef.current = { startX: e.touches[0].clientX, startY: e.touches[0].clientY, panX: pan.x, panY: pan.y };
    } else if (e.touches.length === 1 && zoom === 1 && photos.length > 1) {
      // Pas zoomé — un seul doigt sert à défiler entre les photos plutôt
      // qu'à déplacer l'image (qui n'a de sens qu'une fois zoomée).
      swipeStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (e.touches.length === 2 && pinchRef.current) {
      const scale = touchDist(e.touches) / pinchRef.current.startDist;
      setZoom(Math.min(4, Math.max(1, pinchRef.current.startZoom * scale)));
    } else if (e.touches.length === 1 && dragRef.current) {
      const dx = e.touches[0].clientX - dragRef.current.startX;
      const dy = e.touches[0].clientY - dragRef.current.startY;
      setPan({ x: dragRef.current.panX + dx, y: dragRef.current.panY + dy });
    }
  }
  function handleTouchEnd(e: React.TouchEvent) {
    // Défilement horizontal du doigt — seuil assez large pour ne pas se
    // déclencher par accident sur un simple tapotement, et une nette
    // préférence horizontale pour ne pas gêner le défilement vertical de
    // la page en dessous (peu probable ici vu que la lightbox couvre tout
    // l'écran, mais reste prudent).
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    if (start && e.changedTouches.length === 1) {
      const dx = e.changedTouches[0].clientX - start.x;
      const dy = e.changedTouches[0].clientY - start.y;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        go(dx < 0 ? 1 : -1);
      }
    }
    dragRef.current = null;
    pinchRef.current = null;
  }

  // Rendu via portail directement dans <body> — nécessaire car le panneau
  // de détail parent a un backdrop-filter (flou d'arrière-plan), ce qui crée
  // un nouveau "containing block" en CSS et piège les éléments position:fixed
  // à l'intérieur de ses propres limites plutôt que de couvrir tout l'écran.
  return createPortal(
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(10,11,14,0.9)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24, overflow: 'hidden', touchAction: 'none',
      }}
      onWheel={handleWheel}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute', top: 20, right: 24, background: 'none', border: 'none',
          color: '#fff', fontSize: 28, cursor: 'pointer', lineHeight: 1, zIndex: 2,
        }}
      >
        ✕
      </button>

      {photos.length > 1 && (
        <>
          <button
            onClick={(e) => { e.stopPropagation(); go(-1); }}
            style={{
              position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(20,22,27,0.6)', border: 'none', color: '#fff', fontSize: 26,
              width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', zIndex: 2,
            }}
          >
            ‹
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); go(1); }}
            style={{
              position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
              background: 'rgba(20,22,27,0.6)', border: 'none', color: '#fff', fontSize: 26,
              width: 44, height: 44, borderRadius: '50%', cursor: 'pointer', zIndex: 2,
            }}
          >
            ›
          </button>
          <div style={{ position: 'absolute', top: 20, left: 24, color: 'rgba(255,255,255,0.7)', fontSize: 13, fontFamily: 'var(--font-mono)' }}>
            {index + 1} / {photos.length}
          </div>
        </>
      )}

      <img
        src={photos[index]}
        alt="Photo agrandie"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={handleMouseDown}
        onDoubleClick={(e) => { e.stopPropagation(); zoom > 1 ? resetZoom() : setZoom(2); }}
        draggable={false}
        style={{
          maxWidth: '92vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: 10,
          cursor: zoom > 1 ? 'grab' : 'zoom-in',
          transform: `scale(${zoom}) translate(${pan.x / zoom}px, ${pan.y / zoom}px)`,
          transition: dragRef.current ? 'none' : 'transform 0.15s ease',
          userSelect: 'none',
        }}
      />

      <div style={{ position: 'absolute', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 8, zIndex: 2 }}>
        <button
          onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.max(1, z - 0.5)); }}
          style={{ background: 'rgba(20,22,27,0.6)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 16 }}
        >
          −
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); resetZoom(); }}
          style={{ background: 'rgba(20,22,27,0.6)', border: 'none', color: '#fff', padding: '0 12px', height: 32, borderRadius: 16, cursor: 'pointer', fontSize: 11.5, fontFamily: 'var(--font-mono)' }}
        >
          {Math.round(zoom * 100)}%
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setZoom((z) => Math.min(4, z + 0.5)); }}
          style={{ background: 'rgba(20,22,27,0.6)', border: 'none', color: '#fff', width: 32, height: 32, borderRadius: '50%', cursor: 'pointer', fontSize: 16 }}
        >
          +
        </button>
      </div>
    </div>,
    document.body,
  );
}
