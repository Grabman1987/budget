import {
  AxisLine,
  ChartSvg,
  Graticule,
  Line,
  XTicks,
  useIsPhone,
  type Point,
  type XTick,
} from '@budget/ui';
import { scaleLinear } from 'd3-scale';
import { useElementWidth } from '../charts/use-element-width';
import type { PricePoint } from './portfolio-api';
import { priceText } from './portfolio-model';

const axisNumber = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });
const MONTHS = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const DAY_MS = 86_400_000;
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T00:00:00Z`) / DAY_MS);

/** Month starts that fit on the axis (about one label per 90 px), as `Okt 23`. */
export function axisTicks(
  prices: ReadonlyArray<PricePoint>,
  x: (day: number) => number,
  width: number,
): XTick[] {
  if (prices.length < 2) return [];
  const first = dayNumber((prices[0] as PricePoint).date);
  const last = dayNumber((prices[prices.length - 1] as PricePoint).date);
  const starts: { day: number; label: string }[] = [];
  const start = new Date((prices[0] as PricePoint).date + 'T00:00:00Z');
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth() + 1;
  for (;;) {
    if (m > 11) {
      m = 0;
      y += 1;
    }
    const day = Math.round(Date.UTC(y, m, 1) / DAY_MS);
    if (day > last) break;
    if (day > first) starts.push({ day, label: `${MONTHS[m]} ${String(y).slice(2)}` });
    m += 1;
  }
  const fit = Math.max(2, Math.floor(width / 90));
  const step = Math.max(1, Math.ceil(starts.length / fit));
  return starts.filter((_, i) => i % step === 0).map((s) => ({ x: x(s.day), label: s.label }));
}

/**
 * Price line of one product (Kursverlauf): the solid line plots like a plotter, prices entered by
 * hand are marked with a circle. Composed from the chart primitives of packages/ui.
 */
export function PriceChart({
  prices,
  currency,
  label,
}: {
  prices: ReadonlyArray<PricePoint>;
  currency: string;
  label: string;
}) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const phone = useIsPhone();
  const height = phone ? 180 : 200;
  return (
    <div ref={ref} className="pf-price-box">
      {width > 0 && prices.length > 1 && (
        <Drawing prices={prices} currency={currency} width={width} height={height} label={label} />
      )}
    </div>
  );
}

function Drawing({
  prices,
  currency,
  width,
  height,
  label,
}: {
  prices: ReadonlyArray<PricePoint>;
  currency: string;
  width: number;
  height: number;
  label: string;
}) {
  const values = prices.map((p) => p.priceMicro / 1e6);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.08 || 1;
  const left = 52;
  const right = 10;
  const top = 10;
  const bottom = height - 22;
  const first = dayNumber((prices[0] as PricePoint).date);
  const last = dayNumber((prices[prices.length - 1] as PricePoint).date);
  const x = scaleLinear()
    .domain([first, Math.max(last, first + 1)])
    .range([left, width - right]);
  const y = scaleLinear()
    .domain([lo - pad, hi + pad])
    .range([bottom, top]);
  const line: Point[] = prices.map((p) => [x(dayNumber(p.date)), y(p.priceMicro / 1e6)]);
  const grid = y.ticks(3).map((v) => ({ y: y(v), label: axisNumber.format(v) }));
  const lastPrice = prices[prices.length - 1] as PricePoint;
  const manual = prices.filter((p) => p.source === 'manual');
  return (
    <ChartSvg
      width={width}
      height={height}
      label={`${label}, zuletzt ${priceText(lastPrice.priceMicro, currency)}`}
      testId="price-chart"
    >
      <Graticule x1={left} x2={width - right} lines={grid} />
      <AxisLine x1={left} x2={width - right} y={bottom} />
      <XTicks y={height - 6} ticks={axisTicks(prices, x, width)} />
      <Line kind="actual" points={line} draw />
      {manual.map((p) => (
        <circle
          key={p.date}
          cx={x(dayNumber(p.date))}
          cy={y(p.priceMicro / 1e6)}
          r={3}
          className="pf-hand-dot"
        />
      ))}
      <circle
        cx={(line[line.length - 1] as Point)[0]}
        cy={(line[line.length - 1] as Point)[1]}
        r={4}
        className="dot-actual"
      />
    </ChartSvg>
  );
}
