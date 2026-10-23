import { chartPoints } from '../charts/tooltip-data';
import {
  useAmountPrivacy,
  AxisLine,
  Band,
  ChartSvg,
  Graticule,
  Line,
  XTicks,
  type BandPoint,
  type Point,
} from '@budget/ui';
import type { LiquidityReport } from '@budget/domain';
import { useElementWidth } from '../charts/use-element-width';
import { eur, longDay, shortDay } from '../ledger/format';
import { kfmt, yTicks } from '../wealth/networth-model';
import { lowestPoint } from './liquidity-selection';
import './reports-future.css';

const MONTHS = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const L = 56;
const T = 36;
const B = 28;
/** Strip under the plot (no line reaches it) that holds the Tiefststand label. */
const LOW_ROOM = 40;

/** Tick label: day and month for 90 days, month and year beyond. */
function tickLabel(day: string, horizon: LiquidityReport['horizon']): string {
  const month = Number(day.slice(5, 7));
  return horizon === '35d' || horizon === '90d'
    ? `${Number(day.slice(8))}.${month}.`
    : `${MONTHS[month - 1]} ${day.slice(2, 4)}`;
}

/**
 * Prognose der Budget-Konten: the balance with the planned events (dashed forecast line), the
 * band up to the balance with 10 % more variable spending, the balance without events (dash-dot),
 * the planned events as marks on the line and the lowest point as elevation mark. Port of the
 * chart of `R.liquiditaet` in `design/prototype/reports-zukunft.js` on the chart primitives.
 * HEUTE and GEHALT (when known) are vertical marks; the Tiefststand is derived here as the minimum
 * of the plotted balance line and labelled in the strip below the plot.
 */
export function LiquidityChart({
  report,
  salaryDay = null,
  compact = false,
}: {
  report: LiquidityReport;
  salaryDay?: string | null;
  compact?: boolean;
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  return (
    <div ref={ref} className="rf-chart">
      {width > 0 && report.points.length > 1 && (
        <Drawing report={report} width={width} salaryDay={salaryDay} compact={compact} />
      )}
    </div>
  );
}

function Drawing({
  report,
  width: W,
  salaryDay,
  compact,
}: {
  report: LiquidityReport;
  width: number;
  salaryDay: string | null;
  compact: boolean;
}) {
  useAmountPrivacy();
  const narrow = W < 520;
  const H = compact ? (narrow ? 220 : 248) : narrow ? 260 : 320;
  const R = narrow ? 64 : 92;
  const { points } = report;
  const low = lowestPoint(points);
  const n = points.length - 1;
  // Drawing geometry only: euros as plain numbers, never stored or summed again.
  const all = points
    .flatMap((p) => [p.balanceCents, p.bufferCents, p.plainCents])
    .map((c) => c / 100);
  const lo = Math.min(0, ...all);
  const hi = Math.max(0, ...all);
  const pad = (hi - lo) * 0.1 || 500;
  const y0 = lo - pad;
  const y1 = hi + pad;
  const x = (i: number) => L + (i / n) * (W - L - R);
  const plotBottom = H - B - LOW_ROOM;
  const y = (v: number) => plotBottom - ((v - y0) / (y1 - y0)) * (plotBottom - T);
  const pts = (pick: (p: (typeof points)[number]) => number): Point[] =>
    points.map((p, i) => [x(i), y(pick(p) / 100)]);
  const band: BandPoint[] = points.map((p, i) => ({
    x: x(i),
    y0: y(p.balanceCents / 100),
    y1: y(p.bufferCents / 100),
  }));
  const indexOfDay = new Map(points.map((p, i) => [p.day, i]));
  const grid = yTicks(y0, y1).map((v) => ({ y: y(v), label: kfmt(v) }));
  const preferredStep =
    report.horizon === '35d'
      ? 7
      : report.horizon === '90d'
        ? 14
        : report.horizon === '6m'
          ? 30
          : 61;
  const step = Math.max(preferredStep, Math.ceil((60 * n) / (W - L - R)));
  const ticks = points
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i % step === 0 && x(i) <= W - R + 4)
    .map(({ p, i }) => ({ x: x(i), label: tickLabel(p.day, report.horizon), emphasis: i === 0 }));
  const salaryIndex = salaryDay ? indexOfDay.get(salaryDay) : undefined;
  // HEUTE and GEHALT share a row unless the marks are closer than a label is wide.
  const salaryLow = salaryIndex !== undefined && x(salaryIndex) - x(0) < 64;
  // The label runs left of its line when it would leave the chart on the right.
  const salaryEnd = salaryIndex !== undefined && x(salaryIndex) + 100 > W;
  const lastPoint = points[n]!;
  const endY = y(lastPoint.balanceCents / 100);
  const plainY = y(lastPoint.plainCents / 100);
  const plainLabelY = Math.abs(plainY - endY) < 14 ? endY + 18 : plainY;
  const summary =
    `Saldo der Budget-Konten, heute ${eur(points[0]!.balanceCents)}, am ${longDay(lastPoint.day)} ` +
    `${eur(lastPoint.balanceCents)}` +
    (low ? `; Tiefststand ${eur(low.cents)} am ${longDay(low.day)}.` : '.') +
    (report.eventMarks.length ? ` ${report.eventMarks.length} geplante Ereignisse.` : '');

  return (
    <ChartSvg
      width={W}
      height={H}
      label={summary}
      testId="liquidity-chart"
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
      <Graticule x1={L} x2={W - R} lines={grid} />
      <AxisLine x1={L} x2={W - R} y={y(0)} />
      <Band points={band} />
      <Line kind="previous" points={pts((p) => p.plainCents)} />
      <Line kind="forecast" points={pts((p) => p.balanceCents)} />
      {report.eventMarks.map((e) => {
        const i = indexOfDay.get(e.day);
        const p = i === undefined ? undefined : points[i];
        if (i === undefined || !p) return null;
        return (
          <rect
            key={`${e.day}-${e.label}-${e.cents}`}
            x={x(i) - 4}
            y={y(p.balanceCents / 100) - 4}
            width={8}
            height={8}
            className="ev-mark"
          >
            <title>{`${e.label} · ${longDay(e.day)} · ${eur(e.cents, { sign: true })}`}</title>
          </rect>
        );
      })}
      <circle cx={x(0)} cy={y(points[0]!.balanceCents / 100)} r={4} className="dot-actual" />
      <line x1={x(0)} x2={x(0)} y1={20} y2={plotBottom} className="l-today" />
      <text x={x(0) + 4} y={14} className="svg-label" data-testid="liquidity-mark-heute">
        HEUTE
      </text>
      {salaryIndex !== undefined && (
        <>
          <line
            x1={x(salaryIndex)}
            x2={x(salaryIndex)}
            y1={20}
            y2={plotBottom}
            className="l-plan"
          />
          <text
            x={x(salaryIndex) + (salaryEnd ? -4 : 4)}
            y={salaryLow ? 28 : 14}
            textAnchor={salaryEnd ? 'end' : 'start'}
            className="svg-label"
            data-testid="liquidity-mark-gehalt"
          >
            GEHALT {shortDay(salaryDay!)}
          </text>
        </>
      )}
      {low && (
        <g
          data-testid="liquidity-lowpoint"
          data-day={low.day}
          data-cents={low.cents}
          className={low.cents < 0 ? 'lq-low is-alert' : 'lq-low'}
        >
          <line
            x1={x(low.index)}
            x2={x(low.index)}
            y1={y(low.cents / 100)}
            y2={plotBottom}
            className="l-ext"
          />
          <circle cx={x(low.index)} cy={y(low.cents / 100)} r={5} className="lq-low-dot" />
          <text
            x={x(low.index)}
            y={plotBottom + 16}
            textAnchor={x(low.index) < W / 2 ? 'start' : 'end'}
            className="svg-label-strong lq-halo"
          >
            {eur(low.cents)}
          </text>
          <text
            x={x(low.index)}
            y={plotBottom + 31}
            textAnchor={x(low.index) < W / 2 ? 'start' : 'end'}
            className="svg-label lq-halo"
          >
            TIEFSTSTAND · {shortDay(low.day)}
          </text>
        </g>
      )}
      <text x={W - R + 6} y={endY + 4} className="svg-label-strong">
        {eur(lastPoint.balanceCents, { cents: false })}
      </text>
      {!narrow && (
        <text x={W - R + 6} y={plainLabelY + 4} className="svg-label">
          ohne Ereignisse
        </text>
      )}
      <XTicks y={H - 8} ticks={ticks} />
    </ChartSvg>
  );
}
