import { chartPoints } from '../charts/tooltip-data';
import { useAmountPrivacy, ChartSvg, Graticule, Line, ElevationMark, type Point } from '@budget/ui';
import { addMonths, MAX_FREEDOM_MONTHS, type FreedomProjection } from '@budget/domain';
import { useElementWidth } from '../charts/use-element-width';
import { eur } from '../ledger/format';
import { kfmt, yTicks } from './networth-model';
import { monthText } from './freedom-model';

/** Forecast only: year-end samples returned by the shared engine, including its final partial year. */
export function FreedomChart({
  projection: p,
  target,
  startMonth,
}: {
  projection: FreedomProjection;
  target: number;
  startMonth: string;
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const H = 260,
    L = 56,
    R = 20,
    T = 28,
    B = H - 28;
  const months = p.months ?? MAX_FREEDOM_MONTHS;
  const x = (m: number) => L + (m / Math.max(1, months)) * (width - L - R);
  const values = p.yearlyPath;
  const low = Math.min(0, ...values);
  const high = Math.max(target, ...values, 1);
  const span = (high - low) * 1.12;
  const y = (v: number) => B - ((v - low) / span) * (B - T);
  const points: Point[] = values.map((v, i) => [x(Math.min(i * 12, months)), y(v)]);
  const first = points[0];
  return (
    <div ref={ref} className="freedom-chart">
      {width > 0 && (
        <ChartSvg
          width={width}
          height={H}
          testId="freedom-chart"
          points={chartPoints(
            values.map((_, i) => addMonths(startMonth, Math.min(i * 12, months))),
            (i) => x(Math.min(i * 12, months)),
            [
              { name: 'Prognose', values: values, color: 'var(--line)' },
              { name: 'Ziel', values: values.map(() => target), color: 'var(--line-2)' },
            ],
          )}
          label={`Prognose ab ${monthText(startMonth)}: ${p.doneMonth ? `Ziel erreicht ${monthText(p.doneMonth)}` : 'Ziel innerhalb von 60 Jahren nicht erreicht'}. Keine Garantie.`}
        >
          <Graticule
            x1={L}
            x2={width - R}
            lines={yTicks(low / 100, (low + span) / 100).map((v) => ({
              y: y(v * 100),
              label: kfmt(v),
            }))}
          />
          <path className="l-goal" d={`M${L} ${y(target)}H${width - R}`} />
          <Line kind="forecast" points={points} />
          {first && <circle cx={first[0]} cy={first[1]} r={4} className="dot-actual" />}
          {p.months !== null && (
            <ElevationMark
              x={x(months)}
              y={y(target)}
              label={`Ziel ${p.doneYear}`}
              align={months === 0 ? 'start' : 'end'}
              shelf={18}
            />
          )}
          <text x={L} y={H - 6} className="svg-label-line">
            heute
          </text>
          <text x={width - R} y={H - 6} textAnchor="end" className="svg-label">
            {addMonths(startMonth, months).slice(0, 4)}
          </text>
        </ChartSvg>
      )}
      <details className="freedom-data">
        <summary>Prognosewerte als Tabelle</summary>
        <table className="kv-table">
          <caption>Ungespeicherte Prognose · keine Garantie</caption>
          <thead>
            <tr>
              <th>Monat</th>
              <th>Investiert</th>
            </tr>
          </thead>
          <tbody>
            {values.map((v, i) => (
              <tr key={i}>
                <td>{monthText(addMonths(startMonth, Math.min(i * 12, months)))}</td>
                <td>{eur(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </div>
  );
}
