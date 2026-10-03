import { useAmountPrivacy, ChartSvg, Graticule, Line, type Point } from '@budget/ui';
import { addDays, addMonths } from '@budget/domain';
import { useElementWidth } from '../charts/use-element-width';
import type { SeriesPoint } from '../ledger/types';
import type { DebtAccount, DebtProjection } from './debts-api';
import { kfmt, yTicks } from './networth-model';

/** Geometry only: actual balances and model rows are authoritative API values. */
export function DebtChart({
  loan,
  asOf,
  history,
  result,
}: {
  loan: DebtAccount;
  asOf: string;
  history: SeriesPoint[];
  result: DebtProjection | null;
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const dateNumber = (date: string) => Date.parse(`${date.slice(0, 10)}T00:00:00Z`);
  const actual = history.map((p) => ({ date: p.date, amount: -p.balanceCents }));
  const model = (rows: DebtProjection['plan']['base']['rows']) =>
    result
      ? [
          {
            date: `${result.startMonth}-01` < asOf ? asOf : `${result.startMonth}-01`,
            amount: result.balanceCents,
          },
          ...rows.map((r) => ({
            date: addDays(`${addMonths(r.month, 1)}-01`, -1),
            amount: r.closingCents,
          })),
        ]
      : [];
  const base = model(result?.plan.base.rows ?? []);
  const extra = model(result?.plan.withExtra.rows ?? []);
  const points = [...actual, ...base, ...extra];
  const from = Math.min(...points.map((p) => dateNumber(p.date)), dateNumber(asOf));
  const to = Math.max(...points.map((p) => dateNumber(p.date)), dateNumber(asOf));
  const low = Math.min(0, ...points.map((p) => p.amount));
  const high = Math.max(-loan.balanceCents, ...points.map((p) => p.amount), 1) * 1.08;
  const height = width < 500 ? 220 : 260;
  const x = (date: string) => 56 + ((dateNumber(date) - from) / (to - from || 1)) * (width - 72);
  const y = (amount: number) => height - 30 - ((amount - low) / (high - low)) * (height - 48);
  const line = (p: typeof actual): Point[] => p.map((p) => [x(p.date), y(p.amount)]);
  return (
    <div ref={ref} className="debt-chart">
      {width > 0 && (
        <ChartSvg
          width={width}
          height={height}
          label={`Restschuld ${loan.name} in ${loan.currency}: erfasste Kontohistorie${result ? ', Modell ohne und mit monatlicher Sondertilgung' : ', noch kein Modell berechnet'}.`}
          testId="debt-chart"
        >
          <Graticule
            x1={56}
            x2={width - 16}
            lines={yTicks(low / 100, high / 100).map((v) => ({ y: y(v * 100), label: kfmt(v) }))}
          />
          {actual.length > 1 && <Line points={line(actual)} kind="actual" />}
          <circle cx={x(asOf)} cy={y(-loan.balanceCents)} r={3} fill="var(--line)" />
          {base.length > 1 && <Line points={line(base)} kind="plan" />}
          {extra.length > 1 && <Line points={line(extra)} kind="forecast" />}
          {result &&
            (
              [
                ['ohne', result.plan.base],
                ['mit', result.plan.withExtra],
              ] as const
            ).map(([label, plan], i) => {
              const last = plan.rows.at(-1);
              if (!last) return null;
              const px = x(addDays(`${addMonths(last.month, 1)}-01`, -1));
              const baseline = y(0);
              return (
                <g key={label}>
                  <path d={`M${px - 5},${baseline - 10}h10l-5,9Z`} className="kote" />
                  <text
                    x={px}
                    y={baseline - 16 - i * 16}
                    textAnchor={px > width - 100 ? 'end' : 'middle'}
                    className="svg-label"
                  >
                    {label}: {last.month.slice(5)}.{last.month.slice(0, 4)}
                  </text>
                </g>
              );
            })}
          {[0, 1, 2].map((i) => {
            const date = new Date(from + ((to - from) * i) / 2).toISOString().slice(0, 7);
            return (
              <text
                key={i}
                x={56 + ((width - 72) * i) / 2}
                y={height - 6}
                textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}
                className="svg-label"
              >
                {date.slice(5, 7)}.{date.slice(0, 4)}
              </text>
            );
          })}
        </ChartSvg>
      )}
    </div>
  );
}
