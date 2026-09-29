import { ChevronDown } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { CircleNumber } from './section-head';
import { cx } from './cx';

export interface PartsColumn<Row> {
  key: string;
  header: string;
  /** Right-aligned tabular numbers. */
  numeric?: boolean;
  render: (row: Row) => ReactNode;
}

export interface PartsGroup<Row> {
  id: string;
  title: ReactNode;
  rows: ReadonlyArray<Row>;
  /** Sums in the group row, keyed by column key. */
  summary?: Readonly<Record<string, ReactNode>>;
  /** Text next to the title, e.g. "3 Positionen" or a status. */
  note?: ReactNode;
  defaultCollapsed?: boolean;
}

export interface PartsListProps<Row> {
  /** Name column first; the position number is rendered in front of it. */
  columns: ReadonlyArray<PartsColumn<Row>>;
  groups: ReadonlyArray<PartsGroup<Row>>;
  getRowKey: (row: Row) => string;
  caption: string;
  onRowClick?: (row: Row) => void;
}

/**
 * Parts list (Stückliste): assemblies (groups) with circled numbers and sums, positions 1.1,
 * 1.2 … in front of each row. Groups collapse; the whole row is one button when it is clickable.
 */
export function PartsList<Row>({
  columns,
  groups,
  getRowKey,
  caption,
  onRowClick,
}: PartsListProps<Row>) {
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () => new Set(groups.filter((g) => g.defaultCollapsed).map((g) => g.id)),
  );
  const toggle = (id: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const [first, ...rest] = columns;

  return (
    <table className="ptable">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th className="col-pos tech" scope="col">
            Pos.
          </th>
          {first && (
            <th className="tech" scope="col">
              {first.header}
            </th>
          )}
          {rest.map((c) => (
            <th key={c.key} className={cx('tech', c.numeric && 'col-num')} scope="col">
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      {groups.map((group, groupIndex) => {
        const isCollapsed = collapsed.has(group.id);
        const no = groupIndex + 1;
        return (
          <tbody key={group.id} className={cx(isCollapsed && 'is-collapsed')}>
            <tr className="pgroup">
              <td className="col-pos">
                <CircleNumber n={no} size="sm" />
              </td>
              <td>
                <button
                  type="button"
                  className="grp-toggle"
                  aria-expanded={!isCollapsed}
                  onClick={() => toggle(group.id)}
                >
                  <ChevronDown size={18} strokeWidth={1.75} aria-hidden="true" />
                  {group.title}
                </button>
                {group.note && <span className="grp-status">{group.note}</span>}
              </td>
              {rest.map((c) => (
                <td key={c.key} className={cx(c.numeric && 'col-num')}>
                  {group.summary?.[c.key]}
                </td>
              ))}
            </tr>
            {!isCollapsed &&
              group.rows.map((row, rowIndex) => (
                <tr
                  key={getRowKey(row)}
                  className={cx('prow', onRowClick && 'is-clickable')}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                >
                  <td className="col-pos pos">{`${no}.${rowIndex + 1}`}</td>
                  {first && <td>{first.render(row)}</td>}
                  {rest.map((c) => (
                    <td key={c.key} className={cx(c.numeric && 'col-num')}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
          </tbody>
        );
      })}
    </table>
  );
}
