import type { ReactNode } from 'react';
import type { Point } from './types';
import { useAmountPrivacy, maskMoneyText, privateAmount } from '../amount-privacy';

export interface ChartSvgProps {
  width: number;
  height: number;
  /** Accessible summary; every chart is one `role="img"` with a text alternative. */
  label: string;
  children: ReactNode;
  testId?: string;
}

/** `<svg>` shell: fixed pixel viewBox, one text alternative. Colour comes only from tokens. */
export function ChartSvg({ width, height, label, children, testId }: ChartSvgProps) {
  useAmountPrivacy();
  return (
    <svg
      className="chart"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      role="img"
      aria-label={maskMoneyText(label)}
      data-testid={testId}
    >
      {children}
    </svg>
  );
}

export interface GraticuleLine {
  y: number;
  /** Axis label at the left end, e.g. "1.000". */
  label?: string;
}

/**
 * Graticule (Gradnetz): the faint horizontal lines behind a chart, with axis labels.
 * The graticule exists only behind charts, never as page background.
 */
export function Graticule({
  x1,
  x2,
  lines,
  labelGap = 8,
}: {
  x1: number;
  x2: number;
  lines: ReadonlyArray<GraticuleLine>;
  labelGap?: number;
}) {
  useAmountPrivacy();
  return (
    <g>
      {lines.map((line) => (
        <g key={line.y}>
          <line x1={x1} x2={x2} y1={line.y} y2={line.y} className="graticule" />
          {line.label && (
            <text x={x1 - labelGap} y={line.y + 4} textAnchor="end" className="svg-label">
              {privateAmount(line.label)}
            </text>
          )}
        </g>
      ))}
    </g>
  );
}

/** Axis or reference line. `strong` for the zero line and limits. */
export function AxisLine({
  x1,
  x2,
  y,
  dashed = false,
}: {
  x1: number;
  x2: number;
  y: number;
  dashed?: boolean;
}) {
  return <line x1={x1} x2={x2} y1={y} y2={y} className={dashed ? 'axis axis-dashed' : 'axis'} />;
}

export interface XTick {
  x: number;
  label: string;
  /** Emphasised tick, e.g. "heute". */
  emphasis?: boolean;
}

export function XTicks({ y, ticks }: { y: number; ticks: ReadonlyArray<XTick> }) {
  return (
    <g>
      {ticks.map((tick) => (
        <text
          key={`${tick.x}-${tick.label}`}
          x={tick.x}
          y={y}
          textAnchor="middle"
          className={tick.emphasis ? 'svg-label-line' : 'svg-label'}
        >
          {tick.label}
        </text>
      ))}
    </g>
  );
}

/** "Today" line: dotted `1 3`. */
export function TodayLine({ x, y1, y2 }: { x: number; y1: number; y2: number }) {
  return <line x1={x} x2={x} y1={y1} y2={y2} className="l-today" />;
}

/** Slash terminator of a dimension line (Schrägstrichbegrenzung). */
export function SlashTick({ x, y, size = 7 }: { x: number; y: number; size?: number }) {
  const h = size / 2;
  return <path d={`M${x - h} ${y + h} L${x + h} ${y - h}`} className="l-tick" />;
}

/**
 * Dimension line between two positions with slash terminators and dotted extension lines.
 * `orientation="vertical"` measures between two y values at `at` (x), horizontal between x values.
 */
export function DimensionLine({
  orientation,
  from,
  to,
  at,
  extend,
  alert = false,
}: {
  orientation: 'horizontal' | 'vertical';
  from: number;
  to: number;
  at: number;
  /** Where the dotted extension lines end (the measured objects). */
  extend?: number;
  /** Rotstift: only for a dimension that means "action needed". */
  alert?: boolean;
}) {
  const vertical = orientation === 'vertical';
  const p = (a: number, b: number): Point => (vertical ? [b, a] : [a, b]);
  const [ax, ay] = p(from, at);
  const [bx, by] = p(to, at);
  return (
    <g>
      {extend !== undefined &&
        [from, to].map((v) => {
          const [sx, sy] = p(v, at - 4);
          const [ex, ey] = p(v, extend);
          return <line key={v} x1={sx} y1={sy} x2={ex} y2={ey} className="l-ext" />;
        })}
      <line x1={ax} y1={ay} x2={bx} y2={by} className={alert ? 'l-dim l-dim-alert' : 'l-dim'} />
      <SlashTick x={ax} y={ay} />
      <SlashTick x={bx} y={by} />
    </g>
  );
}
