import {
  useAmountPrivacy,
  AxisLine,
  Band,
  ChartSvg,
  ElevationMark,
  Graticule,
  Line,
  XTicks,
  type BandPoint,
  type Point,
} from '@budget/ui';
import type { LiquidityReport } from '@budget/domain';
import { useElementWidth } from '../charts/use-element-width';
import { eur, longDay } from '../ledger/format';
import { kfmt, yTicks } from '../wealth/networth-model';

const MONTHS = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const L = 56;
const T = 16;
const B = 28;

/** Tick label: day and month for 90 days, month and year beyond. */
function tickLabel(day: string, horizon: LiquidityReport['horizon']): string {
  const month = Number(day.slice(5, 7));
  return horizon === '90d'
    ? `${Number(day.slice(8))}.${month}.`
    : `${MONTHS[month - 1]} ${day.slice(2, 4)}`;
}

/**
 * Prognose der Budget-Konten: the balance with the planned events (dashed forecast line), the
 * band up to the balance with 10 % more variable spending, the balance without events (dash-dot),
 * the planned events as marks on the line and the lowest point as elevation mark. Port of the
 * chart of `R.liquiditaet` in `design/prototype/reports-zukunft.js` on the chart primitives.
 */
export function LiquidityChart({ report }: { report: LiquidityReport }) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  return (
    <div ref={ref} className="rf-chart">
      {width > 0 && report.points.length > 1 && <Drawing report={report} width={width} />}
    </div>
  );
}

function Drawing({ report, width: W }: { report: LiquidityReport; width: number }) {
  useAmountPrivacy();
  const narrow = W < 520;
  const H = narrow ? 260 : 320;
  const R = narrow ? 64 : 92;
  const { points, low } = report;
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
  const y = (v: number) => H - B - ((v - y0) / (y1 - y0)) * (H - B - T);
  const pts = (pick: (p: (typeof points)[number]) => number): Point[] =>
    points.map((p, i) => [x(i), y(pick(p) / 100)]);
  const band: BandPoint[] = points.map((p, i) => ({
    x: x(i),
    y0: y(p.balanceCents / 100),
    y1: y(p.bufferCents / 100),
  }));
  const indexOfDay = new Map(points.map((p, i) => [p.day, i]));
  const grid = yTicks(y0, y1).map((v) => ({ y: y(v), label: kfmt(v) }));
  const step = report.horizon === '90d' ? 14 : report.horizon === '6m' ? 30 : 61;
  const ticks = points
    .map((p, i) => ({ p, i }))
    .filter(({ i }) => i % step === 0 && x(i) <= W - R + 4)
    .map(({ p, i }) => ({ x: x(i), label: tickLabel(p.day, report.horizon), emphasis: i === 0 }));
  const lowIndex = low ? (indexOfDay.get(low.day) ?? 0) : 0;
  const lastPoint = points[n]!;
  const endY = y(lastPoint.balanceCents / 100);
  const plainY = y(lastPoint.plainCents / 100);
  const plainLabelY = Math.abs(plainY - endY) < 14 ? endY + 18 : plainY;
  const summary =
    `Saldo der Budget-Konten, heute ${eur(points[0]!.balanceCents)}, am ${longDay(lastPoint.day)} ` +
    `${eur(lastPoint.balanceCents)}` +
    (low ? `; Tiefpunkt ${eur(low.cents)} am ${longDay(low.day)}.` : '.') +
    (report.eventMarks.length ? ` ${report.eventMarks.length} geplante Ereignisse.` : '');

  return (
    <ChartSvg width={W} height={H} label={summary} testId="liquidity-chart">
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
      {low && (
        <ElevationMark
          x={x(lowIndex)}
          y={y(low.cents / 100)}
          shelf={narrow ? 36 : 44}
          label={`Tiefpunkt ${eur(low.cents, { cents: false })}`}
          align={x(lowIndex) < W / 2 ? 'start' : 'end'}
        />
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
