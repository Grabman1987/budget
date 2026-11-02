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
    height = 200,
    left = 58,
    right = 16,
    bottom = 32;
  const points = history.daily;
  const flows = points.map((row) => row.investedCents - history.startValueCents);
  const axis = portfolioIndexAxis([0, ...points.map((row) => row.valueCents), ...flows]);
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
            { name: 'Netto eingezahlt im Zeitraum', value: eur(flows[index]!) },
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
        <StepLine
          points={points.map((row, i) => [x(row.date), y(flows[i]!)])}
          kind="actual"
          className="wealth-net-flows"
          draw={false}
        />
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
          { kind: 'actual', label: 'Netto eingezahlt im Zeitraum (Stufenlinie)' },
        ]}
      />
      <p className="vnote">
        Wertpapiere ohne Depot-Bargeld. Nettoeinzahlungen im Zeitraum, ohne Anfangsbestand.
        Gespeicherte Kurse können fortgeschrieben sein.
      </p>
    </div>
  );
}
