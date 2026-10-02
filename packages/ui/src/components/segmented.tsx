import { cx } from './cx';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
  description?: string;
}

export interface SegmentedProps<T extends string> {
  options: ReadonlyArray<SegmentedOption<T>>;
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group. */
  label: string;
  /** Segments share the width equally (dialogs, mobile). */
  stretch?: boolean;
  className?: string;
}

/** Segmented switch: 8 px frame with 4 px padding, active segment as ink fill. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  stretch = false,
  className,
}: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className={cx('seg', stretch && 'seg-stretch', className)}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          disabled={option.disabled}
          title={option.description}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
