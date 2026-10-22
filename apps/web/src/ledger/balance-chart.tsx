import { useState } from 'react';
import {
  useAmountPrivacy,
  maskMoneyText,
  AxisLine,
  Graticule,
  Line,
  StepLine,
  XTicks,
  TodayLine,
  type Point,
  type XTick,
} from '@budget/ui';
import { lowPoint as forecastLowPoint, type ForecastDay } from '@budget/domain';
import { scaleLinear } from 'd3-scale';
import { useElementWidth } from '../charts/use-element-width';
import { nativeCurrency, valuedCurrency, monthStartLabel, longDay } from './format';
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
 * Index (into `points`) of the Kontoprognose low point: the domain rule `lowPoint` over the forecast days only
 * (today included), the earliest on a tie. -1 without a forecast.
 */
export function forecastLowIndex(
  points: ReadonlyArray<SeriesPoint>,
  forecastStart: number,
): number {
  if (forecastStart >= points.length - 1) return -1;
  const days: ForecastDay[] = points.slice(forecastStart).map((p, index) => ({
    day: p.date,
    index,
    balanceCents: p.balanceCents,
    variableCents: 0,
    items: [],
  }));
  const low = forecastLowPoint(days, Number.POSITIVE_INFINITY);
  return low ? forecastStart + low.index : -1;
}

/** 4 to 5 Y ticks without the zero line (drawn separately); evenly spaced when no nice step fits. */
export function yTicksFor(y0: number, y1: number): number[] {
  const scale = scaleLinear().domain([y0, y1]);
  for (let count = 3; count <= 10; count++) {
    const ticks = scale.ticks(count).filter((v) => v !== 0);
    if (ticks.length >= 4 && ticks.length <= 5) return ticks;
  }
  return [0.2, 0.4, 0.6, 0.8].map((f) => Math.round(y0 + (y1 - y0) * f));
}

/** Height of the compact account-history drawing (owner decision 18.10.2026: at most about 140 px). */
export const CHART_HEIGHT = 140;

/**
 * Balance line of one account (Saldoverlauf): step line drawn like a plotter, forecast dashed, optional credit limit,
 * graticule behind, month starts on the axis and the low point marked when it is a real dip.
 * Composed from the chart primitives of packages/ui.
 */
export function BalanceChart({
  points,
  windowLabel,
  currency = 'EUR',
  previewPoints = [],
  limitCents = null,
  limitLabel = 'Kreditrahmen',
  view = 'native',
}: {
  points: ReadonlyArray<SeriesPoint>;
  windowLabel: string;
  currency?: string;
  previewPoints?: ReadonlyArray<SeriesPoint>;
  limitCents?: number | null;
  limitLabel?: string;
  /** Foreign-currency accounts show one drawing at a time: Kontowährung or EUR valuation. */
  view?: 'native' | 'eur';
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const height = CHART_HEIGHT;
  const combined = previewPoints.length
    ? [...points.filter((p) => p.date < previewPoints[0]!.date), ...previewPoints]
    : points;
  const forecastStart = previewPoints.length
    ? combined.findIndex((p) => p.date === previewPoints[0]!.date)
    : combined.length;
  const eur = currency !== 'EUR' && view === 'eur';
  const ready = width > 0 && points.length > 1;
  return (
    <div ref={ref} className="kchart-box">
      {ready && (
        <Drawing
          points={combined}
          forecastStart={forecastStart}
          limitCents={eur ? null : limitCents}
          limitLabel={limitLabel}
          width={width}
          height={height}
          windowLabel={windowLabel}
          currency={eur ? 'EUR' : currency}
          eurMode={eur}
        />
      )}
      {currency !== 'EUR' && ready && (
        <>
          <p className="kmeta">
            {eur ? 'EUR-Bewertung des Cash-Saldos zum jeweiligen Tag' : `Cash-Saldo · ${currency}`}
          </p>
          {eur && points.some((p) => p.valuation?.eurCents == null) && (
            <p className="kmeta">
              Kurs fehlt · EUR-Verlauf hat Lücken. Tageswerte und Kurse stehen unter dem Diagramm.
            </p>
          )}
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
  forecastStart,
  limitCents,
  limitLabel,
}: {
  points: ReadonlyArray<SeriesPoint>;
  width: number;
  height: number;
  windowLabel: string;
  currency: string;
  eurMode?: boolean;
  forecastStart: number;
  limitCents: number | null;
  limitLabel: string;
}) {
  useAmountPrivacy();
  const [active, setHover] = useState<number | null>(null);
  const hover = active === null ? null : Math.min(active, points.length - 1);
  const values = points.map((p) => (eurMode ? (p.valuation?.eurCents ?? null) : p.balanceCents));
  const known = values.filter((v): v is number => v !== null);
  if (known.length === 0) return <p className="kmeta">EUR-Bewertung: Kurs fehlt</p>;
  const limit = !eurMode && limitCents !== null ? -limitCents : null;
  const lo = Math.min(...known, ...(limit === null ? [] : [limit]));
  const hi = Math.max(...known, ...(limit === null ? [] : [limit]));
  const pad = (hi - lo) * 0.08 || 10_000;
  const y0 = lo - pad;
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
  const parts = (from: number, to: number): Point[][] => {
    const segments: Point[][] = [];
    let segment: Point[] = [];
    for (let i = from; i < to; i++) {
      const value = values[i];
      if (value == null) {
        if (segment.length) segments.push(segment);
        segment = [];
      } else segment.push([x(i), y(value)]);
    }
    if (segment.length) segments.push(segment);
    return segments;
  };
  const actual = parts(0, Math.min(values.length, forecastStart + 1));
  const future = parts(forecastStart, values.length);
  const lastValue = values.at(-1);
  const last: Point | null = lastValue == null ? null : [x(points.length - 1), y(lastValue)];
  const ticks: XTick[] = monthTicks(points)
    .filter((_, i, all) => i % Math.ceil(all.length / 6) === 0)
    .map((t) => ({
      x: x(t.index) + 4,
      label: `${monthStartLabel(t.day)}${points.length > 365 ? ` ${t.day.slice(0, 4)}` : ''}`,
    }));
  const grid = yTicksFor(y0, y1).map((v) => ({ y: y(v), label: axisNumber.format(v / 100) }));
  const hasForecast = forecastStart < points.length - 1;
  const low = eurMode ? -1 : forecastLowIndex(points, forecastStart);
  const lowPoint = low >= 0 ? (points[low] as SeriesPoint) : undefined;
  const lowDir = lowPoint && y(lowPoint.balanceCents) - 15 < top + 8 ? 1 : -1;
  const summary =
    `Saldoverlauf ${windowLabel} · ${currency}: von ${values[0] == null ? 'Kurs fehlt' : nativeCurrency(values[0], currency)} auf ${lastValue == null ? 'Kurs fehlt' : nativeCurrency(lastValue, currency)}` +
    (lowPoint
      ? `, Tiefpunkt ${valuedCurrency(lowPoint.balanceCents, currency, lowPoint.valuation)}`
      : '') +
    '.';

  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="group"
      aria-label={maskMoneyText(summary)}
      data-testid={eurMode ? 'balance-chart-eur' : 'balance-chart'}
    >
      <Graticule x1={left} x2={width - right} lines={grid} />
      {limit !== null && (
        <>
          <Line
            kind="plan"
            points={[
              [left, y(limit)],
              [width - right, y(limit)],
            ]}
          />
          <text
            x={width - right}
            y={y(limit) - 6}
            textAnchor="end"
            className="svg-label svg-value"
          >
            {limitLabel} {nativeCurrency(limit, currency)}
          </text>
        </>
      )}
      {y0 < 0 && y1 > 0 && <AxisLine x1={left} x2={width - right} y={y(0)} />}
      <AxisLine x1={left} x2={width - right} y={bottom} />
      {hasForecast && (
        <g data-testid="balance-chart-today">
          <TodayLine x={x(forecastStart)} y1={top} y2={bottom} />
          <text x={x(forecastStart) - 4} y={top + 8} textAnchor="end" className="svg-label">
            Heute
          </text>
        </g>
      )}
      <XTicks y={height - 6} ticks={ticks} />
      {ticks.map((t) => (
        <line key={t.x} x1={t.x - 4} x2={t.x - 4} y1={bottom} y2={bottom + 4} className="axis" />
      ))}
      {actual.map((part, i) =>
        part.length > 1 ? (
          <StepLine key={i} kind="actual" points={part} draw />
        ) : (
          <circle key={i} cx={part[0]![0]} cy={part[0]![1]} r={3} className="dot-actual" />
        ),
      )}
      {future.map((part, i) => (
        <StepLine key={`future-${i}`} kind="forecast" points={part} />
      ))}
      {last && <circle cx={last[0]} cy={last[1]} r={4} className="dot-actual" />}
      {lowPoint && (
        <g className="fade-in" data-testid="balance-chart-low">
          {/* Marker above the point; below it when the point sits so high that the label would leave the plot. */}
          <path
            d={`M${x(low) - 5},${y(lowPoint.balanceCents) + lowDir * 11} L${x(low) + 5},${y(lowPoint.balanceCents) + lowDir * 11} L${x(low)},${y(lowPoint.balanceCents) + lowDir * 3} Z`}
            className="kote"
          />
          <text
            x={Math.max(left + 70, Math.min(x(low), width - right - 70))}
            y={y(lowPoint.balanceCents) + (lowDir === -1 ? -15 : 22)}
            textAnchor="middle"
            className="svg-label-strong svg-value"
          >{`Tiefpunkt ${nativeCurrency(lowPoint.balanceCents, currency)}`}</text>
        </g>
      )}
      <rect
        x={left}
        y={top}
        width={Math.max(1, width - right - left)}
        height={bottom - top}
        fill="transparent"
        role="slider"
        tabIndex={0}
        aria-label="Saldoverlauf Tageswert"
        aria-valuemin={0}
        aria-valuemax={points.length - 1}
        aria-valuenow={hover ?? points.length - 1}
        aria-valuetext={`${longDay(points[hover ?? points.length - 1]!.date)} · ${values[hover ?? points.length - 1] == null ? 'Kurs fehlt' : nativeCurrency(values[hover ?? points.length - 1]!, currency)}`}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHover(
            Math.max(
              0,
              Math.min(
                points.length - 1,
                Math.round(((e.clientX - rect.left) / rect.width) * (points.length - 1)),
              ),
            ),
          );
        }}
        onPointerLeave={() => setHover(null)}
        onFocus={() => setHover(points.length - 1)}
        onBlur={() => setHover(null)}
        onKeyDown={(e) => {
          if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) {
            e.preventDefault();
            setHover(
              e.key === 'Home'
                ? 0
                : e.key === 'End'
                  ? points.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        points.length - 1,
                        (hover ?? points.length - 1) + (e.key === 'ArrowLeft' ? -1 : 1),
                      ),
                    ),
            );
          }
        }}
      />
      {hover !== null && hover < points.length && (
        <g pointerEvents="none" className="kchart-tooltip">
          <line x1={x(hover)} x2={x(hover)} y1={top} y2={bottom} className="axis axis-dashed" />
          {values[hover] != null && (
            <line
              x1={left}
              x2={width - right}
              y1={y(values[hover]!)}
              y2={y(values[hover]!)}
              className="axis axis-dashed"
            />
          )}
          <rect
            x={Math.max(left, Math.min(x(hover) - 100, width - right - 220))}
            y={top + 2}
            width={220}
            height={42}
            rx={4}
            fill="var(--raised)"
            stroke="var(--rule-strong)"
          />
          <text
            x={Math.max(left, Math.min(x(hover) - 100, width - right - 220)) + 8}
            y={top + 18}
            className="svg-label"
          >
            {longDay(points[hover]!.date)}
            {hover > forecastStart ? ' · Vorschau' : ''}
          </text>
          <text
            x={Math.max(left, Math.min(x(hover) - 100, width - right - 220)) + 8}
            y={top + 35}
            className="svg-label-strong svg-value"
          >
            {values[hover] == null ? 'Kurs fehlt' : nativeCurrency(values[hover]!, currency)}
          </text>
        </g>
      )}
    </svg>
  );
}
