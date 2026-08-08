import { useEffect, useRef, useState } from 'react';

export interface SelectOption {
  value: string;
  label: string;
}

interface Props {
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
}

/** Menu déroulant personnalisé — contrairement à <select>, la liste ouverte
 * d'un <select> natif ne peut presque pas être stylée dans la plupart des
 * navigateurs. Ce composant reproduit l'apparence fermée ET ouverte aux
 * couleurs du site. */
export default function CustomSelect({ value, options, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        className="text-input custom-select-trigger"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{selected?.label ?? value}</span>
        <span className={`custom-select-chevron ${open ? 'open' : ''}`}>▾</span>
      </button>
      {open && (
        <div className="custom-select-list">
          {options.map((o) => (
            <div
              key={o.value}
              className={`custom-select-option ${o.value === value ? 'active' : ''}`}
              onClick={() => { onChange(o.value); setOpen(false); }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
