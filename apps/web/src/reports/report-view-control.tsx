import { Segmented } from '@budget/ui';
import { useLayoutEffect, useRef } from 'react';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import './income-spending-redesign.css';

let pendingFocus: { label: string; value: string } | undefined;

export function ReportViewControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  const ref = useRef<HTMLSelectElement>(null);
  useLayoutEffect(() => {
    if (REDESIGN_ENABLED && pendingFocus?.label === label && pendingFocus.value === value) {
      ref.current?.focus();
      pendingFocus = undefined;
    }
  }, [label, value]);
  if (!REDESIGN_ENABLED)
    return (
      <Segmented
        label={label}
        options={options}
        value={value}
        onChange={onChange}
        {...(className ? { className } : {})}
      />
    );
  return (
    <label className={`${className ?? ''} report-mode-select`}>
      <span className="sr-only">{label}</span>
      <select
        ref={ref}
        value={value}
        onChange={(event) => {
          const next = event.target.value as T;
          if (next !== value) pendingFocus = { label, value: next };
          onChange(next);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
