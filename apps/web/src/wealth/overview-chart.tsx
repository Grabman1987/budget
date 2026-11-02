import type { ContributionHistory } from '@budget/db';
import { ChartSvg, Line, StepLine, LineLegend, useAmountPrivacy } from '@budget/ui';
import { useElementWidth } from '../charts/use-element-width';
import { eur, longDay } from '../ledger/format';
import { kfmt, portfolioIndexAxis } from './networth-model';

/** Geometry only: both series come from the existing contributions report contract. */
export function OverviewChart({ history }: { history: ContributionHistory }) {
  useAmountPrivacy();
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const width = measured || 340,
    height = 160,
    left = 58,
    right = 16,
    bottom = 32;
  const points = history.daily;
  const flows = points.map((row) => row.investedCents);
  const axis = portfolioIndexAxis([...points.map((row) => row.valueCents), ...flows]);
  const first = Date.parse(history.from),
    span = Math.max(1, Date.parse(history.to) - first);
  const x = (date: string) => left + ((Date.parse(date) - first) / span) * (width - left - right);
  const y = (value: number) =>
    12 + ((axis.max - value) / Math.max(1, axis.max - axis.min)) * (height - bottom - 12);
  return (
    <div ref={ref}>
      <ChartSvg
        width={width}
        height={height}
        label="Wertpapiere: Wert und kumulierte Nettoeinzahlungen in Euro"
        testId="wealth-compact-chart"
        points={points.map((row, index) => ({
          x: x(row.date),
          date: row.date,
          series: [
            { name: 'Wert', value: eur(row.valueCents) },
            { name: 'Eingezahlt: Anfangswert + Nettozuflüsse', value: eur(flows[index]!) },
          ],
        }))}
      >
        {axis.ticks.map((value) => (
          <g key={value}>
            <line x1={left} x2={width - right} y1={y(value)} y2={y(value)} className="graticule" />
            <text x={left - 6} y={y(value) + 4} textAnchor="end" className="svg-label">
              {kfmt(Math.round(value) === 0 ? 0 : Math.round(value) / 100)} €
            </text>
          </g>
        ))}
        <Line
          points={points.map((row) => [x(row.date), y(row.valueCents)])}
          kind="actual"
          draw={false}
        />
        <path
          d={`${points.map((row, i) => `${i ? 'H' + x(row.date) + 'V' : 'M' + x(row.date) + ','}${y(flows[i]!)}`).join('')}L${x(points.at(-1)!.date)},${height - bottom}H${x(points[0]!.date)}Z`}
          fill="color-mix(in srgb, var(--primary) 10%, transparent)"
        />
        <StepLine
          points={points.map((row, i) => [x(row.date), y(flows[i]!)])}
          kind="actual"
          className="wealth-net-flows"
          draw={false}
        />
        {history.months
          .filter((row) => row.inflowsCents > 0)
          .map((row) => {
            const point = points.find((point) => point.date === row.to);
            return point ? (
              <circle
                key={row.to}
                cx={x(point.date)}
                cy={y(point.valueCents)}
                r={3}
                fill="var(--surface)"
                stroke="var(--primary)"
                strokeWidth={1.3}
              >
                <title>
                  Einzahlung im Monat bis {longDay(row.to)}: {eur(row.inflowsCents)}
                </title>
              </circle>
            ) : null;
          })}
        <text x={left} y={height - 4} className="svg-label">
          {longDay(history.from)}
        </text>
        <text x={width - right} y={height - 4} textAnchor="end" className="svg-label">
          {longDay(history.to)}
        </text>
      </ChartSvg>
      <LineLegend
        items={[
          { kind: 'actual', label: 'Wert Portfolio' },
          { kind: 'actual', label: '▭ Eingezahlt' },
          { kind: 'actual', label: '○ Einzahlung' },
        ]}
      />
    </div>
  );
}
