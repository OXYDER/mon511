import { useRef, useState, ReactNode } from 'react';

interface Props {
  text: string;
  children: ReactNode;
  /** Position de la bulle par rapport à l'élément déclencheur. */
  side?: 'top' | 'bottom' | 'left' | 'right';
}

/** Info-bulle stylée aux couleurs du site — remplace l'attribut title=
 * natif du navigateur (rendu générique du système d'exploitation,
 * jamais aux couleurs du site, apparition lente et incohérente d'un
 * navigateur à l'autre).
 *
 * IMPORTANT : le conteneur utilise `display: contents` plutôt que
 * `position: relative` — plusieurs éléments déclencheurs dans ce
 * projet (ex. .locate-btn-float, .map-menu-btn) sont déjà positionnés
 * en absolu par rapport à un ancêtre précis plus haut dans l'arbre ;
 * un wrapper position:relative deviendrait leur nouveau contexte de
 * positionnement et casserait leur emplacement voulu. La bulle
 * elle-même se positionne en `position: fixed` à partir des vraies
 * coordonnées de l'élément (getBoundingClientRect), jamais relative au
 * wrapper — donc jamais de conflit, peu importe où ce composant est
 * utilisé.
 *
 * ATTENTION : un élément display:contents n'a plus de "boîte" propre
 * à mesurer — getBoundingClientRect() dessus retourne toujours des
 * coordonnées à zéro (coin supérieur gauche de l'écran), peu importe
 * où l'élément apparaît vraiment. Il faut donc mesurer le premier
 * enfant RÉEL (le déclencheur passé en children, qui lui a une vraie
 * boîte), jamais le conteneur lui-même. */
export default function Tooltip({ text, children, side = 'bottom' }: Props) {
  const [visible, setVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);

  function show() {
    const rect = ref.current?.firstElementChild?.getBoundingClientRect();
    if (!rect) return;
    const positions: Record<string, { top: number; left: number }> = {
      top: { top: rect.top - 8, left: rect.left + rect.width / 2 },
      bottom: { top: rect.bottom + 8, left: rect.left + rect.width / 2 },
      left: { top: rect.top + rect.height / 2, left: rect.left - 8 },
      right: { top: rect.top + rect.height / 2, left: rect.right + 8 },
    };
    setCoords(positions[side]);
    setVisible(true);
  }

  const translate: Record<string, string> = {
    top: 'translate(-50%, -100%)',
    bottom: 'translate(-50%, 0)',
    left: 'translate(-100%, -50%)',
    right: 'translate(0, -50%)',
  };

  return (
    <span
      ref={ref}
      style={{ display: 'contents' }}
      onMouseEnter={show}
      onMouseLeave={() => setVisible(false)}
      onFocus={show}
      onBlur={() => setVisible(false)}
    >
      {children}
      {visible && text && coords && (
        <span
          role="tooltip"
          style={{
            position: 'fixed', top: coords.top, left: coords.left, transform: translate[side],
            zIndex: 3000, whiteSpace: 'nowrap', pointerEvents: 'none',
            background: 'var(--panel-solid)', color: 'var(--text-body)', border: '1px solid var(--accent-signal)',
            borderRadius: 8, padding: '6px 10px', fontSize: 12, fontWeight: 500,
            boxShadow: 'var(--shadow-panel)', animation: 'tooltip-fade-in 0.12s ease-out',
          }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
