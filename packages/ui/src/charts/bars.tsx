import { TrendLine } from './trend';

export interface Bar {
  /** Band centre. */
  x: number;
  value: number;
  /** Optional native tooltip text. */
  title?: string;
}

/**
 * Bars around a zero line in their own band (no second y-axis).
 * `ink` = solid ink (own contribution), `pale` = pale ink (market), `signed` = teal/orange direction
 * colours, only for signed changes. Direction is also readable from the bar's side of zero.
 */
export type BarTone = 'ink' | 'pale' | 'signed';

export interface BarsAroundZeroProps {
  bars: ReadonlyArray<Bar>;
  /** Maps a value to y (same scale as the zero line). */
  y: (value: number) => number;
  barWidth: number;
  tone?: BarTone;
  /** Keep historical negative values quiet, or draw debt as a dashed outline. */
  negativeTone?: 'red' | 'ink' | 'outline';
}

export function BarsAroundZero({
  bars,
  y,
  barWidth,
  tone = 'ink',
  negativeTone = 'red',
}: BarsAroundZeroProps) {
  const zero = y(0);
  return (
    <g>
      <TrendLine points={bars.map((b) => [b.x, y(b.value)])} />
      {bars.map((bar) => {
        const top = Math.min(y(bar.value), zero);
        const height = Math.max(1, Math.abs(y(bar.value) - zero));
        const cls =
          bar.value < 0
            ? negativeTone === 'outline'
              ? 'bar-neg-outline'
              : negativeTone === 'ink'
                ? 'bar-neg-ink'
                : 'bar-neg2'
            : tone === 'signed'
              ? 'bar-pos'
              : tone === 'pale'
                ? 'bar-mkt'
                : 'bar-own';
        return (
          <rect
            key={bar.x}
            x={bar.x - barWidth / 2}
            y={top}
            width={barWidth}
            height={height}
            className={cls}
          >
            {bar.title && <title>{bar.title}</title>}
          </rect>
        );
      })}
    </g>
  );
}
