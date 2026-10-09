import { useEffect, useId, useRef, useState, type ReactNode, type PointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { Point } from './types';
import { useAmountPrivacy, maskMoneyText, privateAmount } from '../amount-privacy';

export interface ChartSvgProps {
  /** Interactive drawings expose their links as a group instead of a flattened image. */
  role?: 'img' | 'group';
  width: number;
  height: number;
  /** Accessible summary; every chart is one `role="img"` with a text alternative. */
  label: string;
  children: ReactNode;
  testId?: string;
  className?: string;
  points?: ReadonlyArray<ChartTooltipPoint>;
  /** Non-time charts select the node/sector marked with data-chart-point. */
  crosshair?: boolean;
  content?: ReactNode;
  tooltipNote?: string;
}

export interface ChartTooltipPoint {
  x: number;
  date: string;
  series: ReadonlyArray<{ name: string; value: string; color?: string; className?: string }>;
}

export function chartDate(date: string): string {
  const range = /^(\d{4}-\d{2}(?:-\d{2})?) · (\d{4}-\d{2}(?:-\d{2})?)$/.exec(date);
  if (range) return `${chartDate(range[1]!)} bis ${chartDate(range[2]!)}`;
  if (!/^\d{4}-\d{2}(-\d{2})?$/.test(date)) return date;
  return new Intl.DateTimeFormat('de-AT', {
    ...(date.length === 7 ? { month: 'long' } : { day: '2-digit', month: '2-digit' }),
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date.length === 7 ? `${date}-01` : date}T12:00:00Z`));
}

/** `<svg>` shell: fixed pixel viewBox, one text alternative. Colour comes only from tokens. */
export function ChartSvg({
  role = 'img',
  width,
  height,
  label,
  children,
  testId,
  className = '',
  points = [],
  crosshair = true,
  content,
  tooltipNote,
}: ChartSvgProps) {
  useAmountPrivacy();
  const ref = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const tooltip = useRef<HTMLDivElement>(null);
  const id = useId();
  const [index, setIndex] = useState<number | null>(null);
  const pinned = useRef(false);
  const point = index === null ? undefined : points[index];
  const hide = () => {
    setIndex(null);
    pinned.current = false;
  };
  useEffect(() => {
    const outside = (event: globalThis.PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) {
        setIndex(null);
        pinned.current = false;
      }
    };
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, []);
  const position = (next: number, measuredHeight?: number) => {
    const root = ref.current;
    if (root) {
      const bounds = root.getBoundingClientRect();
      const boxWidth = Math.min(360, window.innerWidth - 32);
      const x = bounds.left + ((points[next]?.x ?? 0) / width) * bounds.width;
      const target = root.querySelector(`[data-chart-point="${next}"]`);
      const y = (target?.getBoundingClientRect().top ?? bounds.top) + 8;
      const boxHeight = measuredHeight ?? (points[next]?.series.length ?? 1) * 24 + 50;
      tooltip.current?.style.setProperty(
        '--chart-tooltip-top',
        `${Math.max(16, Math.min(window.innerHeight - boxHeight - 16, y))}px`,
      );
      tooltip.current?.style.setProperty(
        '--chart-tooltip-left',
        `${Math.max(16, Math.min(window.innerWidth - boxWidth - 16, x))}px`,
      );
    }
  };
  const show = (next: number) => {
    position(next);
    setIndex(next);
  };
  const select = (event: PointerEvent<Element>) => {
    const hit = (event.target as Element)
      .closest('[data-chart-point]')
      ?.getAttribute('data-chart-point');
    if (hit !== undefined && hit !== null) {
      show(Number(hit));
      return;
    }
    if (!crosshair) {
      hide();
      return;
    }
    if (!points.length) return;
    const matrix = svg.current?.getScreenCTM();
    if (!matrix) return;
    const x = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse()).x;
    let nearest = 0;
    points.forEach((p, i) => {
      if (Math.abs(p.x - x) < Math.abs(points[nearest]!.x - x)) nearest = i;
    });
    show(nearest);
  };
  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- This focusable group exposes chart data with arrow keys and pointer input.
    <div
      ref={ref}
      className="chart-interactive"
      role="group"
      aria-label={maskMoneyText(label)}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Arrow keys inspect the chart's data points.
      tabIndex={points.length ? 0 : undefined}
      aria-describedby={points.length ? `${id}-help${point ? ` ${id}-tooltip` : ''}` : undefined}
      onFocus={(e) => {
        if (e.target === e.currentTarget && points.length && index === null) show(0);
      }}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) hide();
      }}
      onPointerLeave={(e) => {
        if (e.pointerType !== 'touch' && !pinned.current && document.activeElement !== ref.current)
          hide();
      }}
      onPointerMove={(e) => {
        if (e.pointerType !== 'touch' && !pinned.current) select(e);
      }}
      onPointerDown={(e) => {
        select(e);
        pinned.current = e.pointerType === 'touch';
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' && point) {
          e.stopPropagation();
          e.preventDefault();
          hide();
        }
        if (
          (e.key === 'ArrowLeft' || e.key === 'ArrowRight') &&
          !e.altKey &&
          !e.ctrlKey &&
          !e.metaKey &&
          points.length
        ) {
          e.preventDefault();
          e.stopPropagation();
          show(
            index === null
              ? 0
              : Math.max(0, Math.min(points.length - 1, index + (e.key === 'ArrowRight' ? 1 : -1))),
          );
        }
      }}
    >
      {points.length > 0 && (
        <span id={`${id}-help`} className="sr-only">
          Werte mit Pfeil links und rechts erkunden, Escape blendet sie aus.
        </span>
      )}
      {content ?? (
        <svg
          ref={svg}
          className={`chart ${className}`}
          viewBox={`0 0 ${width} ${height}`}
          width={width}
          height={height}
          role={role}
          aria-label={maskMoneyText(label)}
          data-testid={testId}
        >
          {children}
          {point && crosshair && (
            <line
              x1={point.x}
              x2={point.x}
              y1={8}
              y2={height > 60 ? height - 24 : height - 2}
              className="chart-crosshair"
            />
          )}
        </svg>
      )}
      {point &&
        createPortal(
          <div
            ref={(node) => {
              tooltip.current = node;
              if (node && index !== null) position(index, node.getBoundingClientRect().height);
            }}
            id={`${id}-tooltip`}
            role="status"
            aria-live="polite"
            className="chart-tooltip"
          >
            {point.series.map((s, i) => (
              <div className="chart-tooltip-row" key={i}>
                <svg width="12" height="12" aria-hidden="true">
                  <rect
                    width="12"
                    height="12"
                    className={s.className}
                    fill={s.color ?? 'var(--line)'}
                  />
                </svg>
                <span>{s.name}</span>
                <strong>{privateAmount(s.value)}</strong>
              </div>
            ))}
            <div className="chart-tooltip-date">{chartDate(point.date)}</div>
            {tooltipNote && <p className="chart-tooltip-note">{tooltipNote}</p>}
          </div>,
          document.body,
        )}
    </div>
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

/** HTML bar charts use the same keyboard, touch and value inspection as SVG charts. */
export function ChartValues({
  label,
  points,
  children,
}: {
  label: string;
  points: ReadonlyArray<ChartTooltipPoint>;
  children: ReactNode;
}) {
  return (
    <ChartSvg
      width={100}
      height={40}
      label={label}
      points={points}
      crosshair={false}
      content={children}
    >
      {null}
    </ChartSvg>
  );
}
export function ChartValue({
  label,
  date,
  series,
  children,
}: {
  label: string;
  date: string;
  series: ChartTooltipPoint['series'];
  children: ReactNode;
}) {
  return (
    <ChartValues label={label} points={[{ x: 50, date, series }]}>
      <div className="chart-value-target" data-chart-point={0}>
        {children}
      </div>
    </ChartValues>
  );
}
