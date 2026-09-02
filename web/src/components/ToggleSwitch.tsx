import Tooltip from './Tooltip';

interface Props {
  on: boolean;
  onToggle: () => void;
  title?: string;
}

export default function ToggleSwitch({ on, onToggle, title }: Props) {
  const switchEl = (
    <div
      className={`toggle-switch ${on ? 'on' : ''}`}
      onClick={onToggle}
      role="switch"
      aria-checked={on}
    >
      <div className="knob" />
    </div>
  );

  if (!title) return switchEl;
  return <Tooltip text={title}>{switchEl}</Tooltip>;
}
