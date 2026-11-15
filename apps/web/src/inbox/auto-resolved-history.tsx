import { longDay } from '../ledger/format';
import type { AutoResolvedWarning } from './api';

/**
 * Entry history of warnings the nightly market run closed by itself (#1101): when the warning
 * was opened, with which error class, and when and why it was closed. Read-only.
 */
export function AutoResolvedHistory({ items }: { items: AutoResolvedWarning[] }) {
  if (!items.length) return null;
  return (
    <details className="inbox-auto-resolved">
      <summary>Automatisch geschlossene Warnungen · {items.length}</summary>
      <p>
        Diese Warnungen hat der nächste erfolgreiche Abruf geschlossen. Warnungen zu echten
        Abweichungen schließen sich nie von selbst.
      </p>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <strong>{item.title}</strong>
            <ol aria-label={`Verlauf: ${item.title}`}>
              <li>
                {longDay(item.createdAt.slice(0, 10))} · Warnung geöffnet
                {item.detail ? ` (${item.detail})` : ''}
              </li>
              <li>
                {longDay(item.resolvedAt.slice(0, 10))} · {item.resolution}
              </li>
            </ol>
          </li>
        ))}
      </ul>
    </details>
  );
}
