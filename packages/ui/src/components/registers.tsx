import type { ReactNode } from 'react';

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

/** Second-level navigation as register tabs (there is no third menu level). */
export function Registers({ items, current, label, onSelect, renderLink }: RegistersProps) {
  return (
    <nav className="registers" aria-label={label}>
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
            aria-current={ariaCurrent}
            onClick={() => onSelect?.(item.id)}
          >
            {item.label}
          </button>
        );
      })}
    </nav>
  );
}
