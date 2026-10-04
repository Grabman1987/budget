import { chartPoints } from '../charts/tooltip-data';
import {
  useAmountPrivacy,
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
import { eur, monthName } from '../ledger/format';
import { kfmt, yTicks } from '../wealth/networth-model';
import type { AssetsDebtsHistory } from './assets-debts-api';

const L = 56;
const R = 14;
const T = 14;
const B = 28;

const short = (month: string) => `${monthName(`${month}-01`).slice(0, 3)} ${month.slice(2, 4)}`;
export const longMonth = (month: string) => `${monthName(`${month}-01`)} ${month.slice(0, 4)}`;

/** Every n-th label so that they fit. */
const every = (count: number, width: number) => Math.max(1, Math.ceil((count * 46) / width));

/**
 * Vermögen und Schulden: the assets of every month end as ink bars above the zero line, the debts
 * as pale bars below it, the net worth of the same month ends as line. Click a month to select it;
 * the table beneath the chart is the same data and the keyboard path. Geometry only: the values are
 * read as plain numbers for drawing, never stored or summed again.
 */
export function AssetsDebtsChart({
  history,
  selected,
  onSelect,
}: {
  history: AssetsDebtsHistory;
  selected: string;
  onSelect: (month: string) => void;
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  return (
    <div ref={ref} className="rf-chart rf-chart-lg">
      {width > 0 && history.months.length > 0 && (
        <Drawing history={history} width={width} selected={selected} onSelect={onSelect} />
      )}
    </div>
  );
}

function Drawing({
  history,
  width: W,
  selected,
  onSelect,
}: {
  history: AssetsDebtsHistory;
  width: number;
  selected: string;
  onSelect: (month: string) => void;
}) {
  useAmountPrivacy();
  const { months } = history;
  const n = months.length;
  const narrow = W < 520;
  const H = narrow ? 280 : 340;
  const slot = (W - L - R) / n;
  const x = (i: number) => L + slot * (i + 0.5);
  const bw = Math.max(2, Math.min(28, slot * 0.34));

  const up = months.map((m) => m.assetsCents / 100);
  const down = months.map((m) => m.debtsCents / 100);
  const net = months.map((m) => m.netCents / 100);
  const hi = Math.max(0, ...up, ...net);
  const lo = Math.min(0, ...down, ...net);
  const pad = (hi - lo) * 0.06 || 500;
  const y0 = lo < 0 ? lo - pad : 0;
  const y1 = hi + pad;
  const y = (v: number) => H - B - ((v - y0) / (y1 - y0)) * (H - B - T);
  const grid = yTicks(y0, y1).map((v) => ({
    y: y(v),
    label: v === 0 ? '0' : v < 0 ? `${MINUS}${kfmt(-v)}` : kfmt(v),
  }));
  const gap = bw / 2 + 1;
  const assetBars: Bar[] = months.map((m, i) => ({
    x: x(i) - gap,
    value: up[i] as number,
    title: `Vermögenswerte ${longMonth(m.month)}: ${eur(m.assetsCents)}`,
  }));
  const debtBars: Bar[] = months.map((m, i) => ({
    x: x(i) + gap,
    value: down[i] as number,
    title: `Schulden ${longMonth(m.month)}: ${eur(m.debtsCents)}`,
  }));
  const line: Point[] = months.map((m, i) => [x(i), y(net[i] as number)]);
  const last = line[n - 1] as Point;
  const step = every(n, W - L - R);
  const first = months[0]!;
  const end = months[n - 1]!;
  const summary =
    `Vermögenswerte und Schulden je Monatsende als Balken, Nettovermögen als Linie, ` +
    `${longMonth(first.month)} bis ${longMonth(end.month)}: ` +
    `Nettovermögen von ${eur(first.netCents)} auf ${eur(end.netCents)}.`;
  const picked = months.findIndex((m) => m.month === selected);

  return (
    <ChartSvg
      width={W}
      height={H}
      label={summary}
      testId="assets-debts-chart"
      points={chartPoints(
        months.map((m) => m.month),
        x,
        [
          {
            name: 'Vermögenswerte',
            negativeColor: 'var(--red)',
            values: months.map((m) => m.assetsCents),
            color: 'var(--line)',
          },
          {
            name: 'Schulden',
            negativeColor: 'var(--red)',
            values: months.map((m) => m.debtsCents),
            color: 'var(--red)',
          },
          { name: 'Nettovermögen', values: months.map((m) => m.netCents), color: 'var(--line)' },
        ],
      )}
    >
      {picked >= 0 && (
        <rect
          x={x(picked) - slot / 2}
          y={T - 4}
          width={slot}
          height={H - B - T + 4}
          className="rf-pick"
          data-testid="assets-debts-pick"
        />
      )}
      <Graticule x1={L} x2={W - R} lines={grid} />
      <AxisLine x1={L} x2={W - R} y={y(0)} />
      <BarsAroundZero bars={assetBars} y={y} barWidth={bw} tone="ink" />
      <BarsAroundZero bars={debtBars} y={y} barWidth={bw} tone="pale" />
      <Line kind="actual" points={line} draw={false} className="rf-nw-halo" />
      <Line kind="actual" points={line} draw className="rf-nw-line" />
      {months.map((m, i) => (
        <circle
          key={m.month}
          cx={x(i)}
          cy={line[i]![1]}
          r={narrow || n > 24 ? 2 : 3}
          className="dot-actual"
        >
          <title>{`Nettovermögen ${longMonth(m.month)}: ${eur(m.netCents)}`}</title>
        </circle>
      ))}
      <g className="fade-in">
        <text
          x={Math.min(last[0] + 8, W - 2)}
          y={last[1] - 8}
          textAnchor="end"
          className="svg-label-strong"
        >
          {kfmt(net[n - 1] as number)}
        </text>
      </g>
      {months.map((m, i) =>
        i === n - 1 || (i % step === 0 && n - 1 - i >= step) ? (
          <text key={m.month} x={x(i)} y={H - 8} textAnchor="middle" className="svg-label">
            {short(m.month)}
            {m.incomplete ? ' ≈' : ''}
          </text>
        ) : null,
      )}
      {months.map((m, i) => (
        // Pointer shortcut only: the table below offers the same choice to keyboard and screen readers.
        <rect
          key={m.month}
          x={x(i) - slot / 2}
          y={T - 4}
          width={slot}
          height={H - B - T + 4}
          className="rf-hit"
          aria-hidden="true"
          data-month={m.month}
          onClick={() => onSelect(m.month)}
        />
      ))}
    </ChartSvg>
  );
}
