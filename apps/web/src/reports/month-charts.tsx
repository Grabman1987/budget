import {
  useAmountPrivacy,
  AxisLine,
  ChartSvg,
  Graticule,
  Line,
  XTicks,
  type Point,
} from '@budget/ui';
import { scaleLinear } from 'd3-scale';
import { useElementWidth } from '../charts/use-element-width';
import { eur } from '../ledger/format';

const axisNumber = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });
const SHORT = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];
const MONTH_LONG = [
  'Jänner',
  'Februar',
  'März',
  'April',
  'Mai',
  'Juni',
  'Juli',
  'August',
  'September',
  'Oktober',
  'November',
  'Dezember',
];

/** Axis label of a month: `Okt`, the year is added on January and on the first month shown. */
const tickLabel = (month: string, first: boolean) => {
  const m = Number(month.slice(5, 7));
  const name = SHORT[m - 1] ?? '';
  return m === 1 || first ? `${name} ${month.slice(2, 4)}` : name;
};
export const monthWithYear = (month: string) =>
  `${MONTH_LONG[Number(month.slice(5, 7)) - 1] ?? ''} ${month.slice(0, 4)}`;

export interface MonthSeries {
  key: string;
  name: string;
  /** CSS class that sets `fill` (`mr-fill-*`). */
  fillClass: string;
  perMonth: number[];
}

/**
 * Bars per month, stacked by series, from the chart primitives of packages/ui. Every bar has a
 * native tooltip; the figures sit in the table next to the chart, the chart has one text
 * alternative.
 */
export function StackedMonthsChart({
  months,
  series,
  label,
  testId,
  height = 240,
}: {
  months: string[];
  series: MonthSeries[];
  label: string;
  testId: string;
  height?: number;
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  return (
    <div ref={ref} className="mr-chart-box">
      {width > 0 && months.length > 0 && (
        <Drawing
          months={months}
          series={series}
          label={label}
          testId={testId}
          width={width}
          height={height}
        />
      )}
    </div>
  );
}

function Drawing({
  months,
  series,
  label,
  testId,
  width,
  height,
}: {
  months: string[];
  series: MonthSeries[];
  label: string;
  testId: string;
  width: number;
  height: number;
}) {
  useAmountPrivacy();
  const left = 46;
  const right = 8;
  const top = 16;
  const bottom = height - 26;
  const totals = months.map((_, i) => series.reduce((a, s) => a + (s.perMonth[i] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const y = scaleLinear().domain([0, max]).nice(4).range([bottom, top]);
  const slot = (width - left - right) / months.length;
  const bw = Math.min(slot * 0.62, 40);
  const x = (i: number) => left + slot * (i + 0.5);
  const step = slot < 34 ? 2 : 1;
  return (
    <ChartSvg width={width} height={height} label={label} testId={testId}>
      <Graticule
        x1={left}
        x2={width - right}
        lines={y
          .ticks(4)
          .filter((v) => v > 0)
          .map((v) => ({ y: y(v), label: axisNumber.format(v / 100) }))}
      />
      <AxisLine x1={left} x2={width - right} y={y(0)} />
      {months.map((m, i) => {
        let acc = 0;
        return (
          <g key={m}>
            {series.map((s) => {
              const v = s.perMonth[i] ?? 0;
              if (v <= 0) return null;
              const y0 = y(acc);
              acc += v;
              return (
                <rect
                  key={s.key}
                  x={x(i) - bw / 2}
                  y={y(acc)}
                  width={bw}
                  height={Math.max(1, y0 - y(acc))}
                  className={s.fillClass}
                >
                  <title>{`${s.name} ${monthWithYear(m)}: ${eur(v)}`}</title>
                </rect>
              );
            })}
          </g>
        );
      })}
      {(() => {
        const i = months.length - 1;
        const total = totals[i] ?? 0;
        return total > 0 ? (
          <text x={x(i)} y={y(total) - 6} textAnchor="middle" className="svg-label-strong">
            {eur(total, { cents: false })}
          </text>
        ) : null;
      })()}
      <XTicks
        y={height - 8}
        ticks={months
          .map((m, i) => ({ m, i }))
          .filter(({ i }) => (months.length - 1 - i) % step === 0)
          .map(({ m, i }) => ({ x: x(i), label: tickLabel(m, i === 0) }))}
      />
    </ChartSvg>
  );
}

/** Net worth of the last twelve month ends as a quiet line with its last point marked. */
export function NetWorthMini({
  points,
  label,
}: {
  points: Array<{ month: string; cents: number }>;
  label: string;
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  return (
    <div ref={ref} className="mr-chart-box">
      {width > 0 && points.length > 1 && (
        <MiniDrawing points={points} label={label} width={width} />
      )}
    </div>
  );
}

function MiniDrawing({
  points,
  label,
  width,
}: {
  points: Array<{ month: string; cents: number }>;
  label: string;
  width: number;
}) {
  useAmountPrivacy();
  const height = 130;
  const left = 8;
  const right = 8;
  const values = points.map((p) => p.cents);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = Math.max(1, (hi - lo) * 0.12);
  const y = scaleLinear()
    .domain([lo - pad, hi + pad])
    .range([height - 24, 8]);
  const x = (i: number) => left + (i / (points.length - 1)) * (width - left - right);
  const line: Point[] = points.map((p, i) => [x(i), y(p.cents)]);
  const last = points.length - 1;
  const idx = [0, Math.floor(last / 3), Math.floor((last * 2) / 3), last].filter(
    (v, i, a) => a.indexOf(v) === i,
  );
  return (
    <ChartSvg width={width} height={height} label={label} testId="onepager-networth-chart">
      <Line points={line} kind="actual" />
      <circle cx={x(last)} cy={y(values[last] ?? 0)} r={3.5} className="dot-actual" />
      <XTicks
        y={height - 6}
        ticks={idx.map((i) => ({ x: x(i), label: tickLabel(points[i]?.month ?? '', i === 0) }))}
      />
    </ChartSvg>
  );
}
