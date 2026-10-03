import {
  useAmountPrivacy,
  AxisLine,
  BarsAroundZero,
  ChartSvg,
  ClassPatterns,
  Graticule,
  Line,
  XTicks,
  patternFill,
  usePatternPrefix,
  type Bar,
  type Point,
} from '@budget/ui';
import { MINUS, type SpendClass } from '@budget/domain';
import type { ReactNode } from 'react';
import { useElementWidth } from '../charts/use-element-width';
import { eur } from '../ledger/format';
import { kfmt, yTicks } from '../wealth/networth-model';
import { monthLong, monthShort } from './table-format';

const L = 48;
const R = 12;
const T = 12;
const B = 28;

/** Months to label on the x axis so that the labels do not touch (about 52 px each). */
function labelIndexes(count: number, width: number): Set<number> {
  const room = Math.max(2, Math.floor((width - L - R) / 52));
  const step = Math.max(1, Math.ceil(count / room));
  const out = new Set<number>();
  for (let i = count - 1; i >= 0; i -= step) out.add(i);
  return out;
}

/** January and the first month of a chart carry the year (`Jän 25`), the others only the name. */
const monthLabel = (month: string, first = false) =>
  monthShort(month, first || month.endsWith('-01'));

/** A responsive chart box: draws nothing until the width is known. */
function ChartBox({
  height,
  className,
  children,
}: {
  height: number;
  className?: string;
  children: (width: number) => ReactNode;
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  return (
    <div ref={ref} className={`tr-chart ${className ?? ''}`} style={{ minHeight: height }}>
      {width > 0 && children(width)}
    </div>
  );
}

export interface CategoryPoint {
  month: string;
  spentCents: number;
  assignedCents: number;
}

/** Ist (bars in the class fill) and Plan (tick: the amount assigned that month), last 12 months. */
export function CategoryChart({
  name,
  cls,
  points,
}: {
  name: string;
  cls: SpendClass;
  points: ReadonlyArray<CategoryPoint>;
}) {
  useAmountPrivacy();
  const prefix = usePatternPrefix('cat');
  const height = 200;
  return (
    <ChartBox height={height}>
      {(W) => {
        const n = points.length;
        // Geometry only: euros as plain numbers for the scale, never stored or summed.
        const euros = points.flatMap((p) => [p.spentCents / 100, p.assignedCents / 100]);
        const hi = Math.max(1, ...euros) * 1.08;
        const bw = (W - L - R) / Math.max(1, n);
        const x = (i: number) => L + (i + 0.5) * bw;
        const y = (v: number) => height - B - (v / hi) * (height - B - T);
        const ticks = yTicks(0, hi, 3);
        const labels = labelIndexes(n, W);
        const fill = cls === 'need' ? 'var(--need)' : patternFill(prefix, cls);
        const summary = `${name}: Ist und Plan der letzten ${n} Monate. Zuletzt ${eur(points[n - 1]?.spentCents ?? 0)} bei ${eur(points[n - 1]?.assignedCents ?? 0)} Plan.`;
        return (
          <ChartSvg width={W} height={height} label={summary} testId="category-chart">
            <ClassPatterns prefix={prefix} />
            <Graticule x1={L} x2={W - R} lines={ticks.map((v) => ({ y: y(v), label: kfmt(v) }))} />
            <AxisLine x1={L} x2={W - R} y={y(0)} />
            {points.map((p, i) => (
              <rect
                key={p.month}
                x={x(i) - bw * 0.28}
                y={y(p.spentCents / 100)}
                width={bw * 0.56}
                height={Math.max(0, y(0) - y(p.spentCents / 100))}
                fill={fill}
                stroke={cls === 'need' ? undefined : `var(--${cls})`}
                strokeWidth={cls === 'need' ? undefined : 1}
              >
                <title>{`${monthLong(p.month)}: ${eur(p.spentCents)}`}</title>
              </rect>
            ))}
            {points.map((p, i) =>
              p.assignedCents > 0 ? (
                <line
                  key={`${p.month}-plan`}
                  x1={x(i) - bw * 0.4}
                  x2={x(i) + bw * 0.4}
                  y1={y(p.assignedCents / 100)}
                  y2={y(p.assignedCents / 100)}
                  className="tr-plan-tick"
                />
              ) : null,
            )}
            <XTicks
              y={height - 8}
              ticks={points.flatMap((p, i) =>
                labels.has(i) ? [{ x: x(i), label: monthLabel(p.month, i === 0) }] : [],
              )}
            />
          </ChartSvg>
        );
      }}
    </ChartBox>
  );
}

export interface SavingsChartPoint {
  month: string;
  rateBp: number | null;
  rollingBp: number | null;
}

/** Sparquote per month (bars around zero), rolling twelve months (line) and the goal (dashed). */
export function SavingsChart({
  points,
  targetBp,
  label,
}: {
  points: ReadonlyArray<SavingsChartPoint>;
  targetBp: number;
  label: string;
}) {
  useAmountPrivacy();
  const height = 260;
  return (
    <ChartBox height={height}>
      {(W) => {
        const n = points.length;
        const pct = (bp: number) => bp / 100;
        const values = points.flatMap((p) => (p.rateBp === null ? [] : [pct(p.rateBp)]));
        const rolling = points.flatMap((p) => (p.rollingBp === null ? [] : [pct(p.rollingBp)]));
        const lo = Math.min(0, ...values, ...rolling);
        const hi = Math.max(pct(targetBp), ...values, ...rolling, 1);
        const pad = (hi - lo) * 0.1;
        const a = lo < 0 ? lo - pad : 0;
        const b = hi + pad;
        const bw = (W - L - R) / Math.max(1, n);
        const x = (i: number) => L + (i + 0.5) * bw;
        const y = (v: number) => height - B - ((v - a) / (b - a)) * (height - B - T);
        const bars: Bar[] = points.flatMap((p, i) =>
          p.rateBp === null
            ? []
            : [
                {
                  x: x(i),
                  value: pct(p.rateBp),
                  title: `${monthLong(p.month)}: ${pct(p.rateBp).toFixed(1).replace('.', ',')} %`,
                },
              ],
        );
        const line: Point[] = points.flatMap((p, i) =>
          p.rollingBp === null ? [] : [[x(i), y(pct(p.rollingBp))] as Point],
        );
        const ticks = yTicks(a, b, 4);
        const labels = labelIndexes(n, W);
        return (
          <ChartSvg width={W} height={height} label={label} testId="savings-chart">
            <Graticule
              x1={L}
              x2={W - R}
              lines={ticks.map((v) => ({
                y: y(v),
                label: `${v < 0 ? MINUS : ''}${Math.round(Math.abs(v))} %`,
              }))}
            />
            <AxisLine x1={L} x2={W - R} y={y(0)} />
            <BarsAroundZero bars={bars} y={y} barWidth={bw * 0.5} tone="pale" />
            <Line
              kind="plan"
              points={[
                [L, y(pct(targetBp))],
                [W - R, y(pct(targetBp))],
              ]}
            />
            {line.length > 1 && <Line kind="actual" points={line} />}
            <XTicks
              y={height - 8}
              ticks={points.flatMap((p, i) =>
                labels.has(i) ? [{ x: x(i), label: monthLabel(p.month, i === 0) }] : [],
              )}
            />
          </ChartSvg>
        );
      }}
    </ChartBox>
  );
}

export interface MoneyAgeChartPoint {
  month: string;
  days: number | null;
}

/** Geldalter in days at each month end (line) against the goal (dashed). */
export function MoneyAgeChart({
  points,
  targetDays,
  label,
}: {
  points: ReadonlyArray<MoneyAgeChartPoint>;
  targetDays: number;
  label: string;
}) {
  useAmountPrivacy();
  const height = 260;
  return (
    <ChartBox height={height}>
      {(W) => {
        const n = points.length;
        const known = points.flatMap((p) => (p.days === null ? [] : [p.days]));
        const hi = Math.max(targetDays, ...known, 1) * 1.1;
        const x = (i: number) => L + (n > 1 ? i / (n - 1) : 0.5) * (W - L - R);
        const y = (v: number) => height - B - (v / hi) * (height - B - T);
        const line: Point[] = points.flatMap((p, i) =>
          p.days === null ? [] : [[x(i), y(p.days)] as Point],
        );
        const last = line[line.length - 1];
        const labels = labelIndexes(n, W);
        return (
          <ChartSvg width={W} height={height} label={label} testId="money-age-chart">
            <Graticule
              x1={L}
              x2={W - R}
              lines={yTicks(0, hi, 4).map((v) => ({ y: y(v), label: String(Math.round(v)) }))}
            />
            <AxisLine x1={L} x2={W - R} y={y(0)} />
            <Line
              kind="plan"
              points={[
                [L, y(targetDays)],
                [W - R, y(targetDays)],
              ]}
            />
            <text x={W - R} y={y(targetDays) - 6} textAnchor="end" className="svg-label-line">
              Ziel {targetDays} Tage
            </text>
            {line.length > 1 && <Line kind="actual" points={line} />}
            {last && <circle cx={last[0]} cy={last[1]} r={3.5} className="dot-actual" />}
            <XTicks
              y={height - 8}
              ticks={points.flatMap((p, i) =>
                labels.has(i) ? [{ x: x(i), label: monthLabel(p.month, i === 0) }] : [],
              )}
            />
          </ChartSvg>
        );
      }}
    </ChartBox>
  );
}
