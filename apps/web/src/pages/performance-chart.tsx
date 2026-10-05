import { chartPoints } from '../charts/tooltip-data';
import { ChartSvg, Graticule, Line, LineLegend, useAmountPrivacy, type Point } from '@budget/ui';
import { useElementWidth } from '../charts/use-element-width';
import { shortDay } from '../ledger/format';
import { yTicks } from '../wealth/networth-model';

export const performanceDecimal = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? '–'
    : new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(value);

export function PerformanceChart({
  label,
  testId,
  rows,
  lines,
}: {
  label: string;
  testId?: string;
  rows: { date: string }[];
  lines: { name: string; values: (number | null)[]; benchmark?: boolean }[];
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const levels = lines.flatMap((l) =>
    l.values.filter((v): v is number => v !== null && Number.isFinite(v)),
  );
  if (rows.length < 2 || !levels.length) return <div ref={ref} />;
  const low = Math.min(...levels),
    high = Math.max(...levels),
    pad = (high - low) * 0.08 || 1;
  const left = 44,
    right = Math.max(left + 1, width - 16),
    height = 260,
    top = 12,
    bottom = height - 30;
  const first = Date.parse(rows[0]!.date),
    span = Math.max(1, Date.parse(rows.at(-1)!.date) - first);
  const x = (date: string) => left + ((Date.parse(date) - first) / span) * (right - left);
  const y = (value: number) =>
    bottom - ((value - low + pad) / (high - low + 2 * pad)) * (bottom - top);
  return (
    <div ref={ref} className="performance-chart">
      {width > 0 && (
        <ChartSvg
          width={width}
          height={height}
          label={label}
          {...(testId ? { testId } : {})}
          points={chartPoints(
            rows.map((r) => r.date),
            (i) => x(rows[i]!.date),
            lines.map((l, i) => ({
              name: l.name,
              values: l.values,
              color: [
                'var(--line)',
                'var(--future)',
                'var(--want)',
                'var(--ink-3)',
                'var(--ink-2)',
              ][i % 5]!,
              format: (v) => `${performanceDecimal(v)}${label.includes('%') ? ' %' : ''}`,
            })),
          )}
        >
          <Graticule
            x1={left}
            x2={right}
            lines={yTicks(low - pad, high + pad, 4).map((v) => ({
              y: y(v),
              label: performanceDecimal(v),
            }))}
          />
          {lines.map((line, li) => {
            const segments: Point[][] = [[]];
            line.values.forEach((v, i) => {
              if (v === null || !Number.isFinite(v)) segments.push([]);
              else segments.at(-1)!.push([x(rows[i]!.date), y(v)]);
            });
            return (
              <g key={li} className={`performance-line performance-line-${li % 5}`}>
                {segments
                  .filter((s) => s.length)
                  .map((s, i) =>
                    s.length === 1 ? (
                      <circle key={i} cx={s[0]![0]} cy={s[0]![1]} r={3} fill="var(--series)" />
                    ) : (
                      <Line
                        key={i}
                        points={s}
                        kind={line.benchmark ? 'forecast' : 'actual'}
                        draw={false}
                      />
                    ),
                  )}
              </g>
            );
          })}
          <text x={left} y={height - 6} className="svg-label">
            {shortDay(rows[0]!.date)}
          </text>
          <text x={right} y={height - 6} textAnchor="end" className="svg-label">
            {shortDay(rows.at(-1)!.date)}
          </text>
        </ChartSvg>
      )}
      <div className="performance-legends">
        {lines.map((l, i) => (
          <div key={i} className={`performance-line performance-line-${i % 5}`}>
            <LineLegend
              items={[{ kind: l.benchmark ? 'forecast' : 'actual', label: `${i + 1}. ${l.name}` }]}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
