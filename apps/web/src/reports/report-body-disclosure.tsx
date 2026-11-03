import { useMediaQuery } from '@budget/ui';
import { useState, useRef, useLayoutEffect, type ReactNode } from 'react';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';

/** Presentation preferences only; print exposes the complete existing reader and restores the screen. */
export function ReportBodyDisclosure({
  id,
  label,
  children,
  defaultOpen = false,
  reveal,
}: {
  id: string;
  label: string;
  children: ReactNode;
  defaultOpen?: boolean;
  reveal?: string | undefined;
}) {
  const key = `budget-report-r8-${id}`;
  const [open, setOpen] = useState(() => {
    try {
      const value = localStorage.getItem(key);
      return value === null ? defaultOpen : value === '1';
    } catch {
      return defaultOpen;
    }
  });
  const printing = useMediaQuery('print');
  const ref = useRef<HTMLDetailsElement>(null);
  useLayoutEffect(() => {
    if (REDESIGN_ENABLED && reveal && ref.current) ref.current.open = true;
  }, [reveal]);
  if (!REDESIGN_ENABLED) return <>{children}</>;
  return (
    <details
      ref={ref}
      className="r8-body-disclosure"
      data-r8-detail={id}
      open={open || printing}
      onToggle={(event) => {
        if (printing || event.currentTarget.open === open) return;
        setOpen(event.currentTarget.open);
        try {
          localStorage.setItem(key, event.currentTarget.open ? '1' : '0');
        } catch {
          /* Private storage may be unavailable. */
        }
      }}
    >
      <summary>{label}</summary>
      {children}
    </details>
  );
}
