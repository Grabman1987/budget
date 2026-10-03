import { useAmountPrivacy, AxisLine, ChartSvg, Graticule, Line, type Point } from '@budget/ui';
import { MINUS } from '@budget/domain';
import { useElementWidth } from '../charts/use-element-width';
import { eur, longDay } from '../ledger/format';
import { kfmt, monthTickLabel, monthTicks, yTicks } from '../wealth/networth-model';
import type { NetWorthHistory } from './wealth-history-api';

const L = 56;
const T = 18;
const B = 28;

/** Ink tone of a type, stepped from solid to pale in display order (blueprint: tones of one ink). */
export const toneOf = (index: number, count: number): string => {
  const share = count <= 1 ? 100 : 100 - Math.round((index / (count - 1)) * 70);
  return `color-mix(in srgb, var(--line) ${share}%, var(--surface))`;
};

/**
 * Vermögensverläufe: the assets stacked by account type above the zero line, the liabilities as
 * dashed outlines below it, the daily net worth as line on top. Port of `R.vermoegen` in
 * `design/prototype/reports-zukunft.js` on the chart primitives; the structure is read at the start,
 * at every week or month end and today (linear in between), the line is the daily series.
 */
export function WealthHistoryChart({ history }: { history: NetWorthHistory }) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  return (
    <div ref={ref} className="rf-chart rf-chart-lg">
      {width > 0 && history.points.length > 1 && <Drawing history={history} width={width} />}
    </div>
  );
}

function Drawing({ history, width: W }: { history: NetWorthHistory; width: number }) {
  useAmountPrivacy();
  const narrow = W < 520;
  const H = narrow ? 280 : 340;
  const R = narrow ? 56 : 84;
  const { points, groups, daily } = history;
  const days = daily.map((d) => d.date);
  const n = days.length - 1;
  const index = new Map(days.map((d, i) => [d, i]));
  // Drawing geometry only: euros as plain numbers, never stored or summed again.
  const up = points.map((p) =>
    groups.reduce((a, g) => a + (p.structure[g.key]?.assetsCents ?? 0), 0),
  );
  const down = points.map((p) =>
    groups.reduce((a, g) => a + (p.structure[g.key]?.debtsCents ?? 0), 0),
  );
  const hi = Math.max(0, ...up, ...daily.map((d) => d.netWorthCents)) / 100;
  const lo = Math.min(0, ...down) / 100;
  const pad = (hi - lo) * 0.06 || 500;
  const y0 = lo < 0 ? lo - pad : 0;
  const y1 = hi + pad;
  const x = (i: number) => L + (n ? i / n : 0.5) * (W - L - R);
  const y = (v: number) => H - B - ((v - y0) / (y1 - y0)) * (H - B - T);
  const px = points.map((p) => x(index.get(p.date) ?? 0));

  const layers = (side: 'assetsCents' | 'debtsCents') => {
    let acc = points.map(() => 0);
    return groups.flatMap((g, gi) => {
      const values = points.map((p) => p.structure[g.key]?.[side] ?? 0);
      if (values.every((v) => v === 0)) return [];
      const top = values.map((v, i) => (acc[i] as number) + v);
      const low = acc;
      acc = top;
      const edge = (arr: number[]) =>
        arr.map((v, i) => `${px[i]!.toFixed(1)},${y(v / 100).toFixed(1)}`);
      const d = `M${edge(top).join('L')}L${edge(low).reverse().join('L')}Z`;
      return [{ g, gi, d }];
    });
  };
  const assets = layers('assetsCents');
  const debts = layers('debtsCents');
  const lastValue = daily[n]!.netWorthCents;
  const line: Point[] = daily.map((d, i) => [x(i), y(d.netWorthCents / 100)]);
  const last = line[n] as Point;
  const grid = yTicks(y0, y1).map((v) => ({
    y: y(v),
    label: v === 0 ? '0' : v < 0 ? `${MINUS}${kfmt(-v)}` : kfmt(v),
  }));
  const ticks = monthTicks(days, W - L - R).filter((t) => x(t.index) <= W - R - 30);
  const summary =
    `Vermögen nach Kontotyp gestapelt, Schulden unter Null, Nettovermögen als Linie: von ` +
    `${eur(daily[0]!.netWorthCents)} am ${longDay(history.from)} auf ${eur(lastValue)} am ${longDay(history.to)}.`;

  return (
    <ChartSvg width={W} height={H} label={summary} testId="wealth-history-chart">
      <Graticule x1={L} x2={W - R} lines={grid} />
      {assets.map(({ g, gi, d }) => (
        <path
          key={g.key}
          d={d}
          className="rf-area"
          style={{ fill: toneOf(gi, groups.length) }}
          data-type={g.key}
        >
          <title>{`${g.label}: ${eur(history.rows.find((r) => r.key === g.key)?.nowCents ?? 0)}`}</title>
        </path>
      ))}
      {debts.map(({ g, d }) => (
        <path key={g.key} d={d} className="rf-area-debt" data-type={g.key}>
          <title>{`${g.label}: ${eur(history.rows.find((r) => r.key === g.key)?.nowCents ?? 0)}`}</title>
        </path>
      ))}
      <AxisLine x1={L} x2={W - R} y={y(0)} />
      <Line kind="actual" points={line} draw={false} className="l-daily rf-nw-halo" />
      <Line kind="actual" points={line} draw className="l-daily rf-nw-line" />
      <g className="fade-in">
        <circle cx={last[0]} cy={last[1]} r={4} className="dot-actual" />
        <text x={last[0] + 8} y={last[1] + 4} className="svg-label-strong">
          {kfmt(lastValue / 100)}
        </text>
      </g>
      {ticks.map((t) => (
        <text key={t.day} x={x(t.index)} y={H - 8} textAnchor="middle" className="svg-label">
          {monthTickLabel(t.day)}
        </text>
      ))}
    </ChartSvg>
  );
}
