import { useState, ReactNode } from 'react';

interface Props {
  text: string;
  children: ReactNode;
  /** Position de la bulle par rapport à l'élément déclencheur. */
  side?: 'top' | 'bottom' | 'left' | 'right';
}

/** Info-bulle stylée aux couleurs du site — remplace l'attribut title=
 * natif du navigateur (rendu générique du système d'exploitation,
 * jamais aux couleurs du site, apparition lente et incohérente d'un
 * navigateur à l'autre). Enveloppe l'élément déclencheur sans changer
 * sa mise en page (display: inline-block, position: relative). */
export default function Tooltip({ text, children, side = 'bottom' }: Props) {
  const [visible, setVisible] = useState(false);

  const positionStyle: Record<string, React.CSSProperties> = {
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 8 },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 8 },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: 8 },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 8 },
  };

  return (
    <span
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
      onFocus={() => setVisible(true)}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && text && (
        <span
          role="tooltip"
          style={{
            position: 'absolute', zIndex: 2000, whiteSpace: 'nowrap', pointerEvents: 'none',
            background: 'var(--panel-solid)', color: 'var(--text-body)', border: '1px solid var(--accent-signal)',
            borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 500,
            boxShadow: 'var(--shadow-panel)', animation: 'tooltip-fade-in 0.12s ease-out',
            ...positionStyle[side],
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
