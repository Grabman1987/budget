import { useAmountPrivacy } from '../amount-privacy';
import { formatPrivateEuro as formatEuro } from '../amount-privacy';
import { cents as toCents, type Cents } from '@budget/domain';
import type { KeyboardEvent } from 'react';
import { ClassPatterns, patternFill, usePatternPrefix } from '../charts/class-patterns';
import { SlashTick } from '../charts/frame';
import { cx } from './cx';
import { useElementWidth } from './use-element-width';

export type ChainFill = 'need' | 'want' | 'future' | 'plain';

export interface ChainPart {
  /** Reported to `onSelect` (which line items to open). */
  key: string;
  label: string;
  /** Integer cents, positive. */
  cents: Cents;
  /** Class fill: Bedarf solid, Wunsch and Zukunft hatched, `plain` pale. */
  fill: ChainFill;
}

export interface ChainSubtrahend {
  key: string;
  label: string;
  /** Integer cents, positive; shown as a deduction. */
  cents: Cents;
  /** `bound` = committed money, hatched. `debt` = dashed outline, never hatched. */
  kind: 'bound' | 'debt';
}

export interface DimensionChainDrawingProps {
  /** Accessible name of the whole chain, e.g. "Frei verfügbar bis Gehalt". */
  label: string;
  /** Partial dimensions on the bar, in order. */
  parts: ReadonlyArray<ChainPart>;
  /** Deducted part under the bar (the result is the total minus this). */
  minus?: ChainSubtrahend | undefined;
  /** Result dimension at the bottom: shown as "= label value". */
  result: { label: string; cents: Cents };
  /** Makes every segment a button that opens its line items (side panel). */
  onSelect?: ((key: string) => void) | undefined;
  /** Unfolded (default) or folded away; opening replays the plotter draw. */
  open?: boolean;
  /** Fixed drawing width in px instead of measuring the container (print, tests). */
  width?: number;
}

const LEFT = 2;
const BAR_Y = 44;
const BAR_H = 14;
const LABEL_Y = 24;
/** Vertical step of a dimension text that had to move up to avoid its neighbour. */
const ROW_STEP = 15;
/** Below this width cents are dropped so the dimension texts still fit. */
const SMALL = 520;
/** Rough advance of one character of the 13 px technical font, to place labels that do not fit. */
const CHAR_PX = 6.6;

const FILL: Record<ChainFill, (prefix: string) => string> = {
  need: () => 'var(--need)',
  want: (prefix) => patternFill(prefix, 'want'),
  future: (prefix) => patternFill(prefix, 'future'),
  plain: () => 'var(--tint-2)',
};

const activate = (select: () => void) => (event: KeyboardEvent) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    select();
  }
};

/**
 * Dimension chain, drawn variant (Maßkette, DESIGN.md `drawChain`): partial dimensions as
 * dimension lines with slash terminators over a 14 px bar in class fills with ink outline, the
 * deducted part below (bound = hatched, debt = dashed outline) and the result dimension "= …".
 * Segments are keyboard operable. Lines are drawn like a plotter (900 ms), the chain unfolds in
 * 240 ms; with reduced motion everything appears at once (see charts.css). The inline variant
 * for KPI rows is `DimensionChain`.
 */
export function DimensionChainDrawing({
  label,
  parts,
  minus,
  result,
  onSelect,
  open = true,
  width: fixedWidth,
}: DimensionChainDrawingProps) {
  useAmountPrivacy();
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const prefix = usePatternPrefix('ch');
  const width = fixedWidth ?? measured;

  const total = parts.reduce((sum, part) => sum + part.cents, 0);
  const right = width - 2;
  const x = (cents: number) => LEFT + (Math.max(0, cents) / Math.max(total, 1)) * (right - LEFT);
  const money = (cents: Cents) => formatEuro(cents, { cents: width >= SMALL });

  // Dimension texts: centred over their part, pushed to the edge when they do not fit, and moved
  // up a row when a neighbour's text is in the way (narrow parts next to wide ones).
  const placements = (() => {
    const placed: Array<{ start: number; end: number; row: number }[]> = [];
    const result: Array<{
      x: number;
      anchor: 'start' | 'middle' | 'end';
      row: number;
      text: string;
    }> = [];
    let from = 0;
    parts.forEach((part, index) => {
      const x0 = x(from);
      from += part.cents;
      const x1 = x(from);
      const text = `${part.label} ${money(part.cents)}`;
      const textWidth = text.length * CHAR_PX;
      const fits = textWidth <= x1 - x0 - 4;
      const anchor = fits ? 'middle' : index === 0 ? 'start' : 'end';
      const at = fits ? (x0 + x1) / 2 : index === 0 ? x0 : x1;
      const start =
        anchor === 'middle' ? at - textWidth / 2 : anchor === 'start' ? at : at - textWidth;
      const end = start + textWidth;
      let row = 0;
      while (placed[row]?.some((other) => start < other.end + 6 && end > other.start - 6)) row += 1;
      (placed[row] ??= []).push({ start, end, row });
      result.push({ x: at, anchor, row, text });
    });
    return result;
  })();
  const rows = placements.reduce((max, p) => Math.max(max, p.row), 0);
  const top = rows * ROW_STEP;
  const labelY = LABEL_Y + top;
  const barY = BAR_Y + top;
  const minusY = barY + BAR_H + 6;
  const resultY = (minus ? 124 : 96) + top;
  const height = resultY + 26;
  const resultEnd = x(result.cents);

  const segment = (key: string, name: string, cents: Cents, children: React.ReactNode) =>
    onSelect ? (
      <g
        key={key}
        className="chain-seg"
        role="button"
        tabIndex={0}
        aria-label={`${name} ${formatEuro(cents)}, Einzelposten zeigen`}
        onClick={() => onSelect(key)}
        onKeyDown={activate(() => onSelect(key))}
      >
        {children}
      </g>
    ) : (
      <g key={key} className="chain-seg is-static">
        {children}
      </g>
    );

  // Running sum before each part (start of its segment on the bar).
  const starts = parts.map((_, index) =>
    parts.slice(0, index).reduce((sum, part) => sum + part.cents, 0),
  );
  return (
    <div ref={ref} className={cx('chain-drawing', open && 'is-open')}>
      <div className="chain-drawing-inner" aria-hidden={!open} inert={!open}>
        {width > 0 && (
          <svg
            className="chain-svg"
            viewBox={`0 0 ${width} ${height}`}
            width={width}
            height={height}
            role="group"
            aria-label={label}
          >
            <ClassPatterns prefix={prefix} />
            {parts.map((part, index) => {
              const x0 = x(starts[index] ?? 0);
              const x1 = x((starts[index] ?? 0) + part.cents);
              const label = placements[index];
              const barWidth = Math.max(1, x1 - x0);
              return segment(
                part.key,
                part.label,
                part.cents,
                <>
                  <rect
                    className="seg-fill"
                    x={x0}
                    y={barY}
                    width={barWidth}
                    height={BAR_H}
                    fill={FILL[part.fill](prefix)}
                  />
                  <rect
                    className="seg-outline"
                    x={x0}
                    y={barY}
                    width={barWidth}
                    height={BAR_H}
                    fill="none"
                    stroke="var(--line)"
                    strokeWidth={1}
                  />
                  <line x1={x0} x2={x0} y1={labelY - 5} y2={barY} className="l-ext" />
                  <line x1={x1} x2={x1} y1={labelY - 5} y2={barY} className="l-ext" />
                  <line x1={x0} x2={x1} y1={labelY} y2={labelY} className="l-dim" />
                  <SlashTick x={x0} y={labelY} />
                  <SlashTick x={x1} y={labelY} />
                  {label && (
                    <text
                      x={label.x}
                      y={labelY - 7 - label.row * ROW_STEP}
                      textAnchor={label.anchor}
                      className="svg-label-strong"
                    >
                      {label.text}
                    </text>
                  )}
                </>,
              );
            })}

            {minus &&
              (() => {
                const debt = minus.kind === 'debt';
                const x0 = x(result.cents);
                const w = x(total) - x0;
                return (
                  <g className="chain-minus">
                    {segment(
                      minus.key,
                      minus.label,
                      toCents(-minus.cents),
                      <>
                        <rect
                          className="seg-fill"
                          x={x0}
                          y={minusY}
                          width={w}
                          height={12}
                          fill={debt ? 'transparent' : patternFill(prefix, 'bound')}
                        />
                        <rect
                          className="seg-outline"
                          x={x0}
                          y={minusY}
                          width={w}
                          height={12}
                          fill="none"
                          stroke={debt ? 'var(--line)' : 'var(--line-2)'}
                          strokeDasharray={debt ? 'var(--dash-debt)' : undefined}
                        />
                        <text
                          x={x0 - 8}
                          y={minusY + 10}
                          textAnchor="end"
                          className="svg-label-line"
                        >
                          {`${minus.label} ${money(toCents(-minus.cents))}`}
                        </text>
                      </>,
                    )}
                  </g>
                );
              })()}

            <line x1={x(0)} x2={x(0)} y1={barY + BAR_H} y2={resultY + 6} className="l-ext" />
            <line
              x1={resultEnd}
              x2={resultEnd}
              y1={barY + BAR_H + (minus ? 18 : 0)}
              y2={resultY + 6}
              className="l-ext"
            />
            <line
              x1={x(0)}
              x2={resultEnd}
              y1={resultY}
              y2={resultY}
              className="l-dim plot-line"
              strokeWidth={1.6}
              pathLength={1}
            />
            <SlashTick x={x(0)} y={resultY} size={9} />
            <SlashTick x={resultEnd} y={resultY} size={9} />
            <text
              x={(x(0) + resultEnd) / 2}
              y={resultY - 8}
              textAnchor="middle"
              className="svg-label-strong"
              fontSize={14}
            >
              {`= ${result.label} ${formatEuro(result.cents, { cents: width >= SMALL })}`}
            </text>
          </svg>
        )}
      </div>
    </div>
  );
}
