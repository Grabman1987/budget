import type { ReactNode } from 'react';
import './page-shell.css';

/** "Stand" left, refresh hint right, one fixed-height line so nothing jumps. */
export function StatusFooter({
  stand,
  hint,
  title,
}: {
  stand: ReactNode;
  hint?: string | null | undefined;
  title?: string;
}) {
  return (
    <div className="status-footer" data-testid="status-footer">
      <span title={title}>{stand}</span>
      <span className="status-footer-hint" role="status">
        {hint ?? ''}
      </span>
    </div>
  );
}

/** White card that carries a detail page section. */
export function PageCard({ children, label }: { children: ReactNode; label?: string }) {
  return (
    // An unnamed <section> has no role; a plain div keeps outer cards out of region queries.
    label ? (
      <section className="card page-card" aria-label={label}>
        {children}
      </section>
    ) : (
      <div className="card page-card">{children}</div>
    )
  );
}
