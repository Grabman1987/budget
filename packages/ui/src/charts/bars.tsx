export interface Bar {
  /** Band centre. */
  x: number;
  value: number;
  /** Optional native tooltip text. */
  title?: string;
}

/**
 * Bars around a zero line in their own band (no second y-axis).
 * `ink` = solid ink (own contribution), `pale` = pale ink (market), `signed` = pastel direction
 * colours, only for signed changes. Direction is also readable from the bar's side of zero.
 */
export type BarTone = 'ink' | 'pale' | 'signed';

export interface BarsAroundZeroProps {
  bars: ReadonlyArray<Bar>;
  /** Maps a value to y (same scale as the zero line). */
  y: (value: number) => number;
  barWidth: number;
  tone?: BarTone;
}

export function BarsAroundZero({ bars, y, barWidth, tone = 'ink' }: BarsAroundZeroProps) {
  const zero = y(0);
  return (
    <g>
      {bars.map((bar) => {
        const top = Math.min(y(bar.value), zero);
        const height = Math.max(1, Math.abs(y(bar.value) - zero));
        const cls =
          tone === 'signed'
            ? bar.value >= 0
              ? 'bar-pos'
              : 'bar-neg2'
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
