interface Props {
  on: boolean;
  onToggle: () => void;
  title?: string;
}

export default function ToggleSwitch({ on, onToggle, title }: Props) {
  return (
    <div
      className={`toggle-switch ${on ? 'on' : ''}`}
      onClick={onToggle}
      role="switch"
      aria-checked={on}
      title={title}
    >
      <div className="knob" />
    </div>
  );
}
