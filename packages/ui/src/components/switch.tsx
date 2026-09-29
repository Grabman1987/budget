interface SwitchBase {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  id?: string;
}

/** The switch has no visible text of its own: name it with `label` or an existing element. */
export type SwitchProps = SwitchBase &
  (
    | {
        /** Accessible name as text. */
        label: string;
        labelledBy?: never;
      }
    | {
        /** Id of the visible element that names the switch (used as `aria-labelledby`). */
        labelledBy: string;
        label?: never;
      }
  );

/** 40 × 22 px track with 1.5 px outline; on = ink fill with ground-coloured knob. */
export function Switch({ checked, onChange, label, labelledBy, disabled, id }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      id={id}
      aria-checked={checked}
      aria-label={label}
      aria-labelledby={labelledBy}
      disabled={disabled}
      className="switch"
      onClick={() => onChange(!checked)}
    >
      <span className="switch-track" aria-hidden="true">
        <span className="switch-knob" />
      </span>
    </button>
  );
}
