import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

export interface RegisterItem {
  id: string;
  label: ReactNode;
  /** Present: rendered as a link. Absent: rendered as a button (controlled state). */
  href?: string;
}

export interface RegistersProps {
  items: RegisterItem[];
  current: string;
  /** Accessible name of the navigation. */
  label: string;
  onSelect?: (id: string) => void;
  /** Router integration: render the link element yourself (e.g. TanStack `Link`). */
  renderLink?: (
    item: RegisterItem,
    props: { className?: string; 'aria-current'?: 'page' | undefined },
  ) => ReactNode;
}

/**
 * Second-level navigation as register tabs (there is no third menu level). Links mark the current
 * page with `aria-current`; the controlled button variant is a toggle group (`aria-pressed`).
 */
export function Registers({ items, current, label, onSelect, renderLink }: RegistersProps) {
  const ref = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  // A row that scrolls sideways shows an edge fade on the side where more registers are hidden.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      const start = el.scrollLeft > 1;
      const end = el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
      setEdges((prev) => (prev.start === start && prev.end === end ? prev : { start, end }));
    };
    update();
    el.addEventListener('scroll', update, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', update);
      observer?.disconnect();
    };
  }, [items.length]);

  return (
    <nav
      ref={ref}
      className="registers"
      aria-label={label}
      data-fade-start={edges.start ? 'true' : undefined}
      data-fade-end={edges.end ? 'true' : undefined}
    >
      {items.map((item) => {
        const active = item.id === current;
        const ariaCurrent = active ? ('page' as const) : undefined;
        if (renderLink && item.href !== undefined) {
          return (
            <span key={item.id} className="registers-item">
              {renderLink(item, { 'aria-current': ariaCurrent })}
            </span>
          );
        }
        if (item.href !== undefined) {
          return (
            <a key={item.id} href={item.href} aria-current={ariaCurrent}>
              {item.label}
            </a>
          );
        }
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSelect?.(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
