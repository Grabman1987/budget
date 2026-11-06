import { chartPoints } from '../charts/tooltip-data';
import { useAmountPrivacy, ChartSvg, Graticule, Line, type Point } from '@budget/ui';
import { useElementWidth } from '../charts/use-element-width';
import { eur, shortDay } from '../ledger/format';
import { yTicks } from '../wealth/networth-model';
import type { ContactReportStatement } from './contact-api';

/** Event order, not equal daily intervals, as in the original contact balance stair chart. */
export function ContactBalanceChart({
  statement,
  height = 234,
  days,
}: {
  statement: ContactReportStatement;
  height?: number;
  /** Show only the movements of the last `days` days up to `statement.asOf`. */
  days?: number;
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const { rows, startCents, startLabel } = chartWindow(statement, days);
  const values = [startCents / 100, ...rows.map((row) => row.balanceCents / 100)];
  const lo = Math.min(...values),
    hi = Math.max(...values);
  const pad = (hi - lo) * 0.08 || 1;
  const bottom = height - 34,
    left = 58,
    right = Math.max(left + 1, width - 18);
  const x = (i: number) => left + (i / Math.max(values.length, 1)) * (right - left);
  const y = (value: number) =>
    bottom - ((value - (lo - pad)) / (hi - lo + pad * 2)) * (height - 60);
  const points: Point[] = values.flatMap(
    (value, i) =>
      [
        [x(i), y(value)],
        [x(i + 1), y(value)],
      ] as Point[],
  );
  const label = `Saldo mit ${statement.contact.name} nach jeder Buchung${days ? ` der letzten ${days} Tage` : ''}: Beginn ${eur(startCents)}, Ende ${eur(statement.balanceCents)}. ${rows.length} Bewegungen; erfasste unbestätigte Buchungen sind enthalten.`;
  return (
    <div ref={ref} className="contact-balance-chart">
      {width > 0 && (
        <ChartSvg
          width={width}
          height={height}
          label={label}
          testId="contact-balance-chart"
          points={chartPoints([startLabel, ...rows.map((r) => r.date)], x, [
            {
              name: 'Saldo',
              values: [startCents, ...rows.map((r) => r.balanceCents)],
              color: 'var(--line)',
            },
          ])}
        >
          <Graticule
            x1={left}
            x2={right}
            lines={yTicks(lo - pad, hi + pad).map((v) => ({
              y: y(v),
              // Axis labels round to two decimals; suppress a floating residual's minus zero.
              label: new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(
                Math.abs(v) < 0.005 ? 0 : v,
              ),
            }))}
          />
          <Line points={points} kind="actual" />
          <circle cx={right} cy={y(values.at(-1)!)} r={3.5} className="dot-actual" />
          <text x={left} y={height - 9} className="svg-label">
            {startLabel}
          </text>
          {rows.length > 1 && (
            <text
              x={x(Math.floor(rows.length / 2))}
              y={height - 9}
              textAnchor="middle"
              className="svg-label"
            >
              {shortDay(rows[Math.floor(rows.length / 2) - 1]!.date)}
            </text>
          )}
          {rows.length > 0 && (
            <text x={right} y={height - 9} textAnchor="end" className="svg-label">
              {shortDay(rows.at(-1)!.date)}
            </text>
          )}
        </ChartSvg>
      )}
      <p className="vnote">
        {days ? `Letzte ${days} Tage · ` : ''}Saldo je erfasster Bewegung · EUR. Gleiche Tage
        behalten die gespeicherte Reihenfolge.
      </p>
    </div>
  );
}

/** Movements inside the window plus the balance carried in from before it. */
export function chartWindow(statement: ContactReportStatement, days?: number) {
  const all = statement.movements;
  if (!days) return { rows: all, startCents: 0, startLabel: 'Start' };
  const end = new Date(`${statement.asOf}T00:00:00Z`);
  end.setUTCDate(end.getUTCDate() - days);
  const from = end.toISOString().slice(0, 10);
  const firstIn = all.findIndex((row) => row.date > from);
  const rows = firstIn < 0 ? [] : all.slice(firstIn);
  const before = firstIn < 0 ? all.at(-1) : all[firstIn - 1];
  return { rows, startCents: before?.balanceCents ?? 0, startLabel: shortDay(from) };
}
