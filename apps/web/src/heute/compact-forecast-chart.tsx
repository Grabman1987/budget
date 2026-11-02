import {
  useAmountPrivacy,
  AxisLine,
  Band,
  ChartSvg,
  Graticule,
  StepLine,
  XTicks,
  type Point,
} from '@budget/ui';
import type { LiquidityReport } from '@budget/domain';
import { chartPoints } from '../charts/tooltip-data';
import { useElementWidth } from '../charts/use-element-width';
import { eur, longDay, shortDay } from '../ledger/format';
import { lowestPoint } from '../reports/liquidity-selection';
import { kfmt, yTicks } from '../wealth/networth-model';

/** Drawing only: the overview and its full drilldown consume the same T2 report in cents. */
export function HeuteForecastChart({
  report,
  salaryDay,
}: {
  report: Pick<LiquidityReport, 'horizon' | 'points' | 'eventMarks'>;
  salaryDay: string | null;
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  return (
    <div ref={ref} className="hv-forecast-plot">
      {width > 0 && report.points.length > 1 && (
        <Drawing report={report} salaryDay={salaryDay} width={width} />
      )}
    </div>
  );
}
function Drawing({
  report,
  salaryDay,
  width: w,
}: {
  report: Pick<LiquidityReport, 'horizon' | 'points' | 'eventMarks'>;
  salaryDay: string | null;
  width: number;
}) {
  const h = 205,
    left = 48,
    right = 16,
    top = 30,
    bottom = 149;
  const { points } = report;
  const values = points.flatMap((p) => [p.balanceCents, p.bufferCents, p.plainCents]);
  const lo = Math.min(0, ...values),
    hi = Math.max(0, ...values);
  const pad = (hi - lo) * 0.1 || 50_000;
  const x = (i: number) => left + (i / (points.length - 1)) * (w - left - right);
  const y = (cents: number) =>
    bottom - ((cents - (lo - pad)) / (hi - lo + 2 * pad)) * (bottom - top);
  const line = (key: 'balanceCents' | 'bufferCents' | 'plainCents'): Point[] =>
    points.map((p, i) => [x(i), y(p[key])]);
  const low = lowestPoint(points);
  const salary = points.findIndex((p) => p.day === salaryDay);
  const last = points.at(-1)!;
  const ticks = points.flatMap((p, i) =>
    i === 0 || i === points.length - 1 || (w >= 520 && i % 7 === 0)
      ? [{ x: x(i), label: shortDay(p.day) }]
      : [],
  );
  return (
    <ChartSvg
      width={w}
      height={h}
      testId="liquidity-chart"
      label={`Budget-Konten · 35 Tage · ${longDay(points[0]!.day)} bis ${longDay(last.day)}${low ? ` · Tiefpunkt ${eur(low.cents)} am ${longDay(low.day)}` : ''}`}
      points={chartPoints(
        points.map((p) => p.day),
        x,
        [
          {
            name: 'Mit Ereignissen',
            values: points.map((p) => p.balanceCents),
            color: 'var(--line)',
          },
          {
            name: '10 % mehr variable Ausgaben',
            values: points.map((p) => p.bufferCents),
            color: 'var(--line-2)',
          },
          {
            name: 'Ohne Ereignisse',
            values: points.map((p) => p.plainCents),
            color: 'var(--ink-3)',
          },
        ],
      )}
    >
      <Graticule
        x1={left}
        x2={w - right}
        lines={yTicks((lo - pad) / 100, (hi + pad) / 100).map((v) => ({
          y: y(v * 100),
          label: kfmt(v),
        }))}
      />
      <AxisLine x1={left} x2={w - right} y={y(0)} />
      <Band
        stepped
        points={points.map((p, i) => ({ x: x(i), y0: y(p.balanceCents), y1: y(p.bufferCents) }))}
      />
      <StepLine kind="previous" points={line('plainCents')} />
      <StepLine kind="forecast" points={line('balanceCents')} />
      <line x1={x(0)} x2={x(0)} y1={20} y2={bottom} className="l-today" />
      <text x={x(0) + 4} y={14} className="svg-label" data-testid="liquidity-mark-heute">
        HEUTE
      </text>
      {salary >= 0 && (
        <>
          <line x1={x(salary)} x2={x(salary)} y1={20} y2={bottom} className="l-plan" />
          <text
            x={x(salary)}
            y={14}
            className="svg-label"
            textAnchor={salary > points.length / 2 ? 'end' : 'start'}
            data-testid="liquidity-mark-gehalt"
          >
            GEHALT {shortDay(salaryDay!)}
          </text>
        </>
      )}
      {low && (
        <g
          className={low.cents < 0 ? 'lq-low is-alert' : 'lq-low'}
          data-testid="liquidity-lowpoint"
          data-day={low.day}
          data-cents={low.cents}
        >
          <line
            x1={x(low.index)}
            x2={x(low.index)}
            y1={y(low.cents)}
            y2={bottom + 8}
            className="l-ext"
          />
          <circle cx={x(low.index)} cy={y(low.cents)} r={4} className="lq-low-dot" />
          <text
            x={x(low.index)}
            y={bottom + 22}
            className="svg-label-strong"
            textAnchor={low.index > points.length / 2 ? 'end' : 'start'}
          >
            {eur(low.cents)}
          </text>
          <text
            x={x(low.index)}
            y={bottom + 35}
            className="svg-label"
            textAnchor={low.index > points.length / 2 ? 'end' : 'start'}
          >
            TIEFSTSTAND · {shortDay(low.day)}
          </text>
        </g>
      )}
      <XTicks y={h - 5} ticks={ticks} />
    </ChartSvg>
  );
}
