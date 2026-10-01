import {
  AxisLine,
  BarsAroundZero,
  ChartSvg,
  Graticule,
  Line,
  type Bar,
  type Point,
} from '@budget/ui';
import { MINUS } from '@budget/domain';
import { useElementWidth } from '../charts/use-element-width';
import { eur } from '../ledger/format';
import type { NetWorthView } from './api';
import { kfmt, monthTickLabel, monthTicks, yTicks } from './networth-model';

/** 320 px on desktop and phone alike, as in the prototype (`.vnw-wide .vline`). */
const HEIGHT = 320;
const L = 56;
const T = 22;
const R = 14;

/**
 * Nettovermögen als Verlauf: the daily line (drawn like a plotter) in the upper two thirds, and
 * beneath it its own band of bars around zero with its own axis: Eigenleistung in ink, Markt in
 * pale ink, per week (up to 3 months) or per month. Port of `drawNW` in
 * `design/prototype/vermoegen.js`, composed from the chart primitives of packages/ui. The end dot
 * and "heute" fade in after the line.
 */
export function NetWorthChart({ view, periodLabel }: { view: NetWorthView; periodLabel: string }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  return (
    <div ref={ref} className="vline">
      {width > 0 && view.daily.length > 1 && (
        <Drawing view={view} width={width} height={HEIGHT} periodLabel={periodLabel} />
      )}
    </div>
  );
}

function Drawing({
  view,
  width: W,
  height: H,
  periodLabel,
}: {
  view: NetWorthView;
  width: number;
  height: number;
  periodLabel: string;
}) {
  const { daily, bars } = view;
  const n = daily.length - 1;
  const indexOf = new Map(daily.map((d, i) => [d.date, i]));
  // Drawing geometry only: euros as plain numbers, never stored or summed again.
  const euros = daily.map((d) => d.netWorthCents / 100);
  const lo = Math.min(...euros);
  const hi = Math.max(...euros);
  const pad = (hi - lo) * 0.12 || 1000;
  const y0 = lo - pad;
  const y1 = hi + pad;
  const split = H * 0.66;
  const x = (i: number) => L + (n ? i / n : 0.5) * (W - L - R);
  const y = (v: number) => split - 10 - ((v - y0) / (y1 - y0)) * (split - 10 - T);

  const line: Point[] = euros.map((v, i) => [x(i), y(v)]);
  const last = line[n] as Point;

  const buckets = bars.buckets.map((b) => ({
    ...b,
    i0: (indexOf.get(b.from) ?? 1) - 1,
    i1: indexOf.get(b.to) ?? n,
  }));
  const bmax = Math.max(
    ...buckets.map((b) => Math.max(Math.abs(b.ownCents), Math.abs(b.marketCents)) / 100),
    1,
  );
  const bh = (H - 28 - split) / 2 - 8;
  const zb = split + (H - 28 - split) / 2 + 8;
  const yBar = (v: number) => zb - (v / bmax) * bh;
  const barWidth = (b: { i0: number; i1: number }) => Math.max(2, (x(b.i1) - x(b.i0)) * 0.36);
  // Every bucket has its own width (partial months, short last week), so one call per bucket.
  const pairs = buckets.map((b) => {
    const w = barWidth(b);
    const cx = (x(b.i0) + x(b.i1)) / 2;
    const own: Bar = {
      x: cx - w / 2 - 1,
      value: b.ownCents / 100,
      title: `Eigenleistung ${eur(b.ownCents)}`,
    };
    const market: Bar = {
      x: cx + w / 2 + 1,
      value: b.marketCents / 100,
      title: `Markt ${eur(b.marketCents)}`,
    };
    return { key: b.from, w, own, market };
  });

  const ticks = monthTicks(
    daily.map((d) => d.date),
    W - L - R,
  ).filter((t) => x(t.index) <= W - R - 40);
  const grid = yTicks(y0, y1).map((v) => ({ y: y(v), label: kfmt(v) }));
  const first0 = daily[0]?.netWorthCents ?? 0;
  const summary =
    `Nettovermögen täglich, ${periodLabel}: von ${eur(first0)} auf ${eur(daily[n]?.netWorthCents ?? 0)}. ` +
    `Darunter Eigenleistung und Markt je ${bars.unit === 'week' ? 'Woche' : 'Monat'}.`;

  return (
    <ChartSvg width={W} height={H} label={summary} testId="networth-chart">
      <text x={L} y={10} className="svg-label-line">
        Nettovermögen
      </text>
      <text x={L} y={split + 14} className="svg-label-line">
        {bars.unit === 'week' ? 'Veränderung je Woche' : 'Veränderung je Monat'}
      </text>
      <Graticule x1={L} x2={W - R} lines={grid} />
      <Line kind="actual" points={line} draw className="l-daily" />
      <g className="fade-in">
        <circle cx={last[0]} cy={last[1]} r={4} className="dot-actual" />
        <text x={W - R} y={H - 6} textAnchor="end" className="svg-label-line">
          heute
        </text>
      </g>
      {/* The bars have their own band and axis. */}
      <AxisLine x1={0} x2={W} y={split + 2} />
      <AxisLine x1={L} x2={W - R} y={zb} />
      <text x={L - 8} y={zb + 4} textAnchor="end" className="svg-label">
        0
      </text>
      <Graticule
        x1={L}
        x2={W - R}
        lines={[
          { y: zb - bh, label: `+${kfmt(bmax)}` },
          { y: zb + bh, label: `${MINUS}${kfmt(bmax)}` },
        ]}
      />
      {pairs.map((p) => (
        <g key={p.key}>
          <BarsAroundZero bars={[p.own]} y={yBar} barWidth={p.w} tone="ink" />
          <BarsAroundZero bars={[p.market]} y={yBar} barWidth={p.w} tone="pale" />
        </g>
      ))}
      {ticks.map((t) => (
        <g key={t.day}>
          <line x1={x(t.index)} x2={x(t.index)} y1={split - 10} y2={split - 5} className="axis" />
          <text x={x(t.index)} y={H - 6} textAnchor="middle" className="svg-label">
            {monthTickLabel(t.day)}
          </text>
        </g>
      ))}
    </ChartSvg>
  );
}
