import { useAmountPrivacy, ClassSwatch, ChartValues } from '@budget/ui';
import {
  heatForCell,
  tableHeatStats,
  tableRowAverage,
  tableRowTotal,
  type TableRow,
} from '@budget/domain';
import { forwardRef, type ReactNode, type CSSProperties } from 'react';
import { chartPercent } from '../charts/tooltip-data';
import { eur } from '../ledger/format';
import { euroNumber, percentWhole } from './table-format';

export interface GridColumn {
  key: string;
  label: string;
  /** Screen-reader text where the label is abbreviated or marked (`Sep 26*`). */
  title?: string;
}

export interface PreviousColumn {
  label: string;
  /** Totals of the previous year by row key. */
  totals: ReadonlyMap<string, number>;
}

interface RowsGridProps {
  rows: ReadonlyArray<TableRow>;
  columns: ReadonlyArray<GridColumn>;
  caption: string;
  total?: boolean;
  average?: boolean;
  previous?: PreviousColumn | null;
  /** Scrollable region name for keyboard users. */
  regionLabel: string;
  className?: string;
  onCell?: ((row: TableRow, column: number | null) => void) | undefined;
  renderLabel?: ((row: TableRow) => ReactNode) | undefined;
}

const ROW_CLASS: Record<TableRow['kind'], string> = {
  sum: 'sum',
  result: 'res',
  level: 'res',
  memo: 'res',
  pct: 'pct',
  group: 'grp',
  income: 'cat',
  category: 'cat',
};

function Cell({
  row,
  value,
  stats,
  point,
  onClick,
}: {
  point: number;
  onClick?: (() => void) | undefined;
  row: TableRow;
  value: number | null;
  stats: ReturnType<typeof tableHeatStats>;
}) {
  useAmountPrivacy();
  if (value === null)
    return (
      <td className="n muted" data-chart-point={point}>
        –
      </td>
    );
  if (row.kind === 'pct')
    return (
      <td className="n" data-chart-point={point}>
        {percentWhole(value)}
      </td>
    );
  const heated =
    row.kind === 'group' || row.kind === 'category' || row.kind === 'income'
      ? heatForCell(value, stats, row.good)
      : null;
  const style = heated ? ({ '--h': heated.strength.toFixed(2) } as CSSProperties) : undefined;
  const className = heated ? `n hc2 ${heated.tone === 'bad' ? 'hc-red' : 'hc-green'}` : 'n';
  return (
    <td className={className} style={style} data-chart-point={point}>
      {onClick ? (
        <button type="button" className="table-cell-open" onClick={onClick}>
          {eur(value)}
        </button>
      ) : (
        <>
          {value === 0 ? (
            <span className="muted">·</span>
          ) : row.signed ? (
            eur(value, { cents: false, sign: true })
          ) : (
            euroNumber(value)
          )}
        </>
      )}
    </td>
  );
}

function Change({ row, total, previous }: { row: TableRow; total: number; previous: number }) {
  useAmountPrivacy();
  const delta = total - previous;
  const better = row.good === 'high' ? delta >= 0 : delta <= 0;
  const tone = delta === 0 ? 'dl-0' : row.good === null ? 'dl-0' : better ? 'dl-good' : 'dl-bad';
  const bp = previous !== 0 ? Math.round((delta * 10_000) / Math.abs(previous)) : null;
  return (
    <td className="n">
      <span className={`dl ${tone}`}>
        {eur(delta, { cents: false, sign: true })}
        {bp !== null && ` · ${percentWhole(bp, true)}`}
      </span>
    </td>
  );
}

/**
 * The monthly grid of the Jahresansicht and the Gesamttabelle: one row per position, one column
 * per month, a diverging heat per row (pastel red against the row's direction, green with it),
 * optional totals, averages and the comparison with the previous year. The first column stays in
 * place while the months scroll.
 */
export const RowsGrid = forwardRef<HTMLDivElement, RowsGridProps>(function RowsGrid(
  {
    rows,
    columns,
    caption,
    total = true,
    average = false,
    previous = null,
    regionLabel,
    className,
    onCell,
    renderLabel,
  },
  ref,
) {
  const points = rows.flatMap((row) =>
    row.vals.map((value, i) => ({
      x: 50,
      date: columns[i]?.key ?? '',
      series: [
        {
          name: row.label,
          value: value === null ? '–' : row.kind === 'pct' ? chartPercent(value) : eur(value),
          color: value !== null && value < 0 ? 'var(--red)' : 'var(--line)',
        },
      ],
    })),
  );
  return (
    <ChartValues label={caption} points={points}>
      <div
        ref={ref}
        className="rscroll rsticky"
        role="region"
        aria-label={regionLabel}
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the complete table.
        tabIndex={0}
      >
        <p className="table-scroll-hint">Seitlich wischen für weitere Spalten</p>
        <table className={`rtable rgrid ${className ?? ''}`}>
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>
              <th scope="col" className="tech rg-first">
                Position
              </th>
              {columns.map((c) => (
                <th key={c.key} scope="col" className="tech n" title={c.title}>
                  {c.label}
                </th>
              ))}
              {total && (
                <th scope="col" className="tech n rg-sum">
                  Summe
                </th>
              )}
              {average && (
                <th scope="col" className="tech n">
                  Ø Monat
                </th>
              )}
              {previous && (
                <>
                  <th scope="col" className="tech n rg-sum">
                    {previous.label}
                  </th>
                  <th scope="col" className="tech n">
                    Veränderung
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => {
              const stats = tableHeatStats(row.vals);
              const sum = tableRowTotal(row);
              const avg = tableRowAverage(row);
              const prev = previous?.totals.get(row.key);
              return (
                <tr
                  key={row.key}
                  className={`rk-${ROW_CLASS[row.kind]}${row.level ? ` lv-${row.level}` : ''}`}
                >
                  <th scope="row" className="rg-first">
                    {row.swatch && (
                      <ClassSwatch kind={row.swatch === 'income' ? 'open' : row.swatch} />
                    )}
                    {renderLabel ? renderLabel(row) : row.label}
                  </th>
                  {row.vals.map((value, i) => (
                    <Cell
                      key={columns[i]?.key ?? i}
                      onClick={onCell ? () => onCell(row, i) : undefined}
                      row={row}
                      value={value}
                      stats={stats}
                      point={rows.slice(0, rowIndex).reduce((n, r) => n + r.vals.length, 0) + i}
                    />
                  ))}
                  {total && (
                    <td className="n rg-sum">
                      {sum === null ? (
                        '–'
                      ) : (
                        <strong>
                          {onCell ? (
                            <button
                              type="button"
                              className="table-cell-open"
                              onClick={() => onCell(row, null)}
                            >
                              {eur(sum)}
                            </button>
                          ) : row.signed ? (
                            eur(sum, { cents: false, sign: true })
                          ) : (
                            euroNumber(sum)
                          )}
                        </strong>
                      )}
                    </td>
                  )}
                  {average && (
                    <td className="n">
                      {avg === null ? (
                        '–'
                      ) : onCell ? (
                        <button
                          type="button"
                          className="table-cell-open"
                          onClick={() => onCell(row, null)}
                        >
                          {eur(avg)}
                        </button>
                      ) : (
                        euroNumber(avg)
                      )}
                    </td>
                  )}
                  {previous &&
                    (sum === null || prev === undefined ? (
                      <>
                        <td className="n rg-sum muted">–</td>
                        <td className="n muted">–</td>
                      </>
                    ) : (
                      <>
                        <td className="n rg-sum">{euroNumber(prev)}</td>
                        <Change row={row} total={sum} previous={prev} />
                      </>
                    ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </ChartValues>
  );
});
