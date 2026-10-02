import { ChartSvg, Graticule, Line, type Point } from '@budget/ui';
import { useElementWidth } from '../charts/use-element-width';
import { eur, shortDay } from '../ledger/format';
import { yTicks } from '../wealth/networth-model';
import type { ContactReportStatement } from './contact-api';

/** Event order, not equal daily intervals, as in the original contact balance stair chart. */
export function ContactBalanceChart({ statement }: { statement: ContactReportStatement }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const rows = statement.movements;
  const values = [0, ...rows.map((row) => row.balanceCents / 100)];
  const lo = Math.min(...values),
    hi = Math.max(...values);
  const pad = (hi - lo) * 0.08 || 1;
  const bottom = 200,
    left = 58,
    right = Math.max(left + 1, width - 18);
  const x = (i: number) => left + (i / Math.max(values.length, 1)) * (right - left);
  const y = (value: number) => bottom - ((value - (lo - pad)) / (hi - lo + pad * 2)) * 174;
  const points: Point[] = values.flatMap(
    (value, i) =>
      [
        [x(i), y(value)],
        [x(i + 1), y(value)],
      ] as Point[],
  );
  const label = `Saldo mit ${statement.contact.name} nach jeder Buchung: Beginn 0,00 €, Ende ${eur(statement.balanceCents)}. ${rows.length} Bewegungen; erfasste unbestätigte Buchungen sind enthalten.`;
  return (
    <div ref={ref} className="contact-balance-chart">
      {width > 0 && (
        <ChartSvg width={width} height={234} label={label} testId="contact-balance-chart">
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
          <text x={left} y={225} className="svg-label">
            Start
          </text>
          {rows.length > 1 && (
            <text
              x={x(Math.floor(rows.length / 2))}
              y={225}
              textAnchor="middle"
              className="svg-label"
            >
              {shortDay(rows[Math.floor(rows.length / 2) - 1]!.date)}
            </text>
          )}
          {rows.length > 0 && (
            <text x={right} y={225} textAnchor="end" className="svg-label">
              {shortDay(rows.at(-1)!.date)}
            </text>
          )}
        </ChartSvg>
      )}
      <p className="vnote">
        Saldo je erfasster Bewegung · EUR. Gleiche Tage behalten die gespeicherte Reihenfolge.
      </p>
    </div>
  );
}
