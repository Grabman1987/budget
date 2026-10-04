import { chartPoints } from '../charts/tooltip-data';
import {
  useAmountPrivacy,
  AxisLine,
  ChartSvg,
  Graticule,
  Line,
  StepLine,
  XTicks,
  useIsPhone,
  type Point,
  type XTick,
} from '@budget/ui';
import { scaleLinear } from 'd3-scale';
import { useElementWidth } from '../charts/use-element-width';
import { nativeCurrency, nativeCurrencyWhole, valuedCurrency, monthStartLabel } from './format';
import type { SeriesPoint } from './types';

const axisNumber = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });

/** Month starts inside the window become axis ticks ("1. August"). */
export function monthTicks(points: ReadonlyArray<SeriesPoint>): { index: number; day: string }[] {
  const out: { index: number; day: string }[] = [];
  points.forEach((p, index) => {
    if (index > 0 && p.date.endsWith('-01')) out.push({ index, day: p.date });
  });
  return out;
}

/** Index of the lowest balance when it is a real dip inside the window, else -1. */
export function lowPointIndex(points: ReadonlyArray<SeriesPoint>): number {
  if (points.length < 3) return -1;
  let low = 0;
  points.forEach((p, i) => {
    if (p.balanceCents < (points[low] as SeriesPoint).balanceCents) low = i;
  });
  return low <= 0 || low >= points.length - 1 ? -1 : low;
}

/**
 * Balance line of one account (Saldoverlauf): step line drawn like a plotter, zero line dashed,
 * graticule behind, month starts on the axis and the low point marked when it is a real dip.
 * Composed from the chart primitives of packages/ui.
 */
export function BalanceChart({
  points,
  windowLabel,
  currency = 'EUR',
}: {
  points: ReadonlyArray<SeriesPoint>;
  windowLabel: string;
  currency?: string;
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const phone = useIsPhone();
  const height = phone ? 200 : 250;
  return (
    <div ref={ref} className="kchart-box">
      {width > 0 && points.length > 1 && (
        <Drawing
          points={points}
          width={width}
          height={height}
          windowLabel={windowLabel}
          currency={currency}
        />
      )}
      {currency !== 'EUR' && width > 0 && points.length > 1 && (
        <>
          <p className="kmeta">
            Cash-Saldo · {currency}; darunter EUR-Bewertung zum jeweiligen Tag
          </p>
          {points.some((p) => p.valuation?.eurCents == null) && (
            <p className="kmeta">
              Kurs fehlt · EUR-Verlauf hat Lücken. Tageswerte und Kurse stehen unter dem Diagramm.
            </p>
          )}
          <Drawing
            points={points}
            width={width}
            height={height}
            windowLabel={windowLabel}
            currency="EUR"
            eurMode
          />
        </>
      )}
    </div>
  );
}

function Drawing({
  points,
  width,
  height,
  windowLabel,
  currency,
  eurMode = false,
}: {
  points: ReadonlyArray<SeriesPoint>;
  width: number;
  height: number;
  windowLabel: string;
  currency: string;
  eurMode?: boolean;
}) {
  useAmountPrivacy();
  const values = points.map((p) => (eurMode ? (p.valuation?.eurCents ?? null) : p.balanceCents));
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return <p className="kmeta">EUR-Bewertung: Kurs fehlt</p>;
  const lo = Math.min(0, ...known);
  const hi = Math.max(0, ...known);
  const pad = (hi - lo) * 0.12 || 10_000;
  const y0 = lo - (lo < 0 ? pad : 0);
  const y1 = hi + pad;
  const left = 56;
  const right = 12;
  const top = 12;
  const bottom = height - 24;
  const x = scaleLinear()
    .domain([0, points.length - 1])
    .range([left, width - right]);
  const y = scaleLinear().domain([y0, y1]).range([bottom, top]);
  // Break the line at missing rates; never interpolate an unavailable day.
  const segments: Point[][] = [];
  let segment: Point[] = [];
  values.forEach((value, i) => {
    if (value === null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push([x(i), y(value)]);
  });
  if (segment.length) segments.push(segment);
  const lastValue = values.at(-1);
  const last: Point | null = lastValue == null ? null : [x(points.length - 1), y(lastValue)];
  const ticks: XTick[] = monthTicks(points).map((t) => ({
    x: x(t.index) + 4,
    label: monthStartLabel(t.day),
  }));
  const grid = y
    .ticks(3)
    .filter((v) => v !== 0)
    .map((v) => ({ y: y(v), label: axisNumber.format(v / 100) }));
  const low = eurMode ? -1 : lowPointIndex(points);
  const lowPoint = low >= 0 ? (points[low] as SeriesPoint) : undefined;
  const summary =
    `Saldoverlauf ${windowLabel} · ${currency}: von ${values[0] == null ? 'Kurs fehlt' : nativeCurrency(values[0], currency)} auf ${lastValue == null ? 'Kurs fehlt' : nativeCurrency(lastValue, currency)}` +
    (lowPoint
      ? `, Tiefpunkt ${valuedCurrency(lowPoint.balanceCents, currency, lowPoint.valuation)}`
      : '') +
    '.';

  return (
    <ChartSvg
      width={width}
      height={height}
      label={summary}
      testId={eurMode ? 'balance-chart-eur' : 'balance-chart'}
      points={chartPoints(
        points.map((p) => p.date),
        x,
        [
          {
            name: eurMode ? 'EUR-Bewertung' : 'Saldo',
            values,
            format: (v) => nativeCurrency(v, currency),
          },
        ],
      )}
    >
      <Graticule x1={left} x2={width - right} lines={grid} />
      <text x={left - 8} y={y(0) + 4} textAnchor="end" className="svg-label">
        0
      </text>
      <Line
        kind="plan"
        points={[
          [left, y(0)],
          [width - right, y(0)],
        ]}
      />
      <AxisLine x1={left} x2={width - right} y={bottom} />
      <XTicks y={height - 6} ticks={ticks} />
      {ticks.map((t) => (
        <line
          key={t.label}
          x1={t.x - 4}
          x2={t.x - 4}
          y1={bottom}
          y2={bottom + 4}
          className="axis"
        />
      ))}
      {segments.map((part, i) =>
        part.length > 1 ? (
          <StepLine key={i} kind="actual" points={part} draw />
        ) : (
          <circle key={i} cx={part[0]![0]} cy={part[0]![1]} r={3} className="dot-actual" />
        ),
      )}
      {last && <circle cx={last[0]} cy={last[1]} r={4} className="dot-actual" />}
      {lowPoint && (
        <g className="fade-in">
          <path
            d={`M${x(low) - 6},${y(lowPoint.balanceCents) + 13} L${x(low) + 6},${y(lowPoint.balanceCents) + 13} L${x(low)},${y(lowPoint.balanceCents) + 2} Z`}
            className="kote"
          />
          <text
            x={x(low) + 10}
            y={y(lowPoint.balanceCents) + 22}
            className="svg-label-strong"
          >{`Tiefpunkt ${nativeCurrencyWhole(lowPoint.balanceCents, currency)}`}</text>
        </g>
      )}
    </ChartSvg>
  );
}
