import { ChartSvg, Graticule, Line, useAmountPrivacy } from '@budget/ui';
import { eur, shortDay } from '../ledger/format';
import { euroAxis, yTicks } from '../wealth/networth-model';
import { useElementWidth } from './use-element-width';

/** Daily stored portfolio valuations, in EUR cents. No normalization or benchmark investment. */
export function PortfolioValueHistory({ rows }: { rows: { date: string; valueCents: number }[] }) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const values = rows.map((row) => row.valueCents / 100);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const pad = (high - low) * 0.08 || 1;
  const x = (index: number) =>
    56 + (index / Math.max(1, rows.length - 1)) * Math.max(1, width - 80);
  const y = (value: number) => 220 - ((value - low + pad) / (high - low + 2 * pad)) * 204;
  const ticks = yTicks(low - pad, high + pad, 4);
  const axis = euroAxis(ticks);
  return (
    <div ref={ref}>
      {width > 0 && rows.length > 1 && (
        <ChartSvg
          width={width}
          height={260}
          label="Portfoliowert pro Tag · EUR ohne Depotkassa"
          testId="portfolio-value-history"
          points={rows.map((row, index) => ({
            date: row.date,
            x: x(index),
            series: [
              { name: 'Wertpapiere in EUR', value: eur(row.valueCents), color: 'var(--line)' },
            ],
          }))}
        >
          <text x={56} y={12} className="svg-label">
            {axis.unit}
          </text>
          <Graticule
            x1={56}
            x2={width - 24}
            lines={ticks.map((value) => ({
              y: y(value),
              label: axis.label(value),
            }))}
          />
          <Line
            points={values.map((value, index) => [x(index), y(value)] as [number, number])}
            kind="actual"
            draw={false}
          />
          <text x={56} y={250} className="svg-label">
            {shortDay(rows[0]!.date)}
          </text>
          <text x={width - 24} y={250} textAnchor="end" className="svg-label">
            {shortDay(rows.at(-1)!.date)}
          </text>
        </ChartSvg>
      )}
      <details>
        <summary>Portfoliowerte als Tabelle · EUR</summary>
        <table className="rtable metrics-lead-table">
          <thead>
            <tr>
              <th scope="col">Datum</th>
              <th scope="col">Wertpapiere · EUR</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.date}>
                <th scope="row">{shortDay(row.date)}</th>
                <td>{eur(row.valueCents)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
