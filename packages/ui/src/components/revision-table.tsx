import type { ReactNode } from 'react';
import { Button } from './button';
import { cx } from './cx';

/** Revision triangle with letter (A, B, C). Urgent = Rotstift with soft tint. */
export function RevisionTriangle({ letter, urgent = false }: { letter: string; urgent?: boolean }) {
  return (
    <svg
      className={cx('rev-tri', urgent && 'is-urgent')}
      viewBox="0 0 26 24"
      role="img"
      aria-label={`Revision ${letter}${urgent ? ', dringend' : ''}`}
    >
      <path d="M13 2.5 24 21.5H2Z" />
      <text x="13" y="18" textAnchor="middle">
        {letter}
      </text>
    </svg>
  );
}

export interface RevisionRow {
  id: string;
  letter: string;
  title: ReactNode;
  detail?: ReactNode;
  /** Only the one urgent action of a revision is Rotstift. */
  urgent?: boolean;
  action?: { label: string; onClick: () => void };
  /** Slides the row out (12 px right) after the action, undo via toast. */
  leaving?: boolean;
}

export interface RevisionTableProps {
  rows: ReadonlyArray<RevisionRow>;
  caption: string;
  /** Shown instead of the table when there are no rows. */
  empty?: ReactNode;
  headers?: { revision: string; change: string; action: string };
}

/** Next steps as revision table: Rev. · Änderung · Aktion. */
export function RevisionTable({
  rows,
  caption,
  empty,
  headers = { revision: 'Rev.', change: 'Änderung', action: 'Aktion' },
}: RevisionTableProps) {
  if (rows.length === 0 && empty) return <div className="rev-empty">{empty}</div>;
  return (
    <table className="rev-table">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th className="tech rev-mark" scope="col">
            {headers.revision}
          </th>
          <th className="tech" scope="col">
            {headers.change}
          </th>
          <th className="tech rev-act" scope="col">
            {headers.action}
          </th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            className={cx('rev-row', row.urgent && 'is-urgent', row.leaving && 'is-leaving')}
          >
            <td className="rev-mark">
              <RevisionTriangle letter={row.letter} urgent={row.urgent ?? false} />
            </td>
            <td className="rev-what">
              <strong>{row.title}</strong>
              {row.detail && <span>{row.detail}</span>}
            </td>
            <td className="rev-act">
              {row.action && (
                <Button
                  size="sm"
                  variant={row.urgent ? 'alert' : 'ghost'}
                  onClick={row.action.onClick}
                >
                  {row.action.label}
                </Button>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
