import { GripVertical } from 'lucide-react';
import type { ComponentProps } from 'react';

/** Shared pointer/keyboard reorder handle for categories and Plan groups. */
export function CategorySortHandle({
  label,
  focusKey,
  ...props
}: ComponentProps<'button'> & { label: string; focusKey: string }) {
  return (
    <button
      type="button"
      className="icon-btn cat-grip"
      aria-label={label}
      data-focus-key={focusKey}
      {...props}
    >
      <GripVertical size={16} strokeWidth={1.75} aria-hidden="true" />
    </button>
  );
}
