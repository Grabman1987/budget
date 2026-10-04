import { chartPoints } from '../charts/tooltip-data';
import {
  useAmountPrivacy,
  ChartSvg,
  chartDate,
  ClassPatterns,
  Graticule,
  Line,
  patternFill,
  usePatternPrefix,
  type Point,
} from '@budget/ui';
import type { YearMonthRow, YearNetWorth } from '@budget/domain';
import { useElementWidth } from '../charts/use-element-width';
import { eur } from '../ledger/format';
import { kfmt, yTicks } from '../wealth/networth-model';
import { monthShort, monthShortYear } from './overview-format';

const LEFT = 44;
const RIGHT = 10;

const MONTH_SLOTS = 12;

/**
 * Sheet 1 A: income as a line, Konsum as stacked columns (Bedarf solid, Wunsch hatched), one
 * slot for every month of the year; months that are not in the report stay empty.
 */
export function YearCashflowChart({ year, rows }: { year: number; rows: YearMonthRow[] }) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const prefix = usePatternPrefix('yr');
  const height = 190;
  const top = 12;
  const bottom = 158;
  const plot = Math.max(1, width - LEFT - RIGHT);
  const slot = plot / MONTH_SLOTS;
  const max = Math.max(1, ...rows.flatMap((r) => [r.incomeCents, r.consumptionCents])) / 100;
  const ticks = yTicks(0, max);
  const hi = Math.max(max, ticks[ticks.length - 1] ?? max);
  const y = (euro: number) => bottom - (euro / hi) * (bottom - top);
  const index = (month: string) => Number(month.slice(5, 7)) - 1;
  const x = (i: number) => LEFT + (i + 0.5) * slot;
  const incomePoints: Point[] = rows.map((r) => [x(index(r.month)), y(r.incomeCents / 100)]);
  const label = `Einkommen je Monat als Linie, Konsum als Säulen: ${rows
    .map(
      (r) =>
        `${monthShort(r.month)} Einkommen ${eur(r.incomeCents, { cents: false })}, Konsum ${eur(r.consumptionCents, { cents: false })}`,
    )
    .join('; ')}.`;
  return (
    <div ref={ref} className="ov-chart">
      {width > 0 && (
        <ChartSvg
          width={width}
          height={height}
          label={label}
          testId="yr-cashflow"
          points={chartPoints(
            rows.map((r) => r.month),
            (i) => x(index(rows[i]!.month)),
            [
              { name: 'Bedarf', values: rows.map((r) => r.needCents), color: 'var(--need)' },
              { name: 'Wunsch', values: rows.map((r) => r.wantCents), color: 'var(--want)' },
              { name: 'Einkommen', values: rows.map((r) => r.incomeCents), color: 'var(--line)' },
            ],
          )}
        >
          <ClassPatterns prefix={prefix} />
          <Graticule
            x1={LEFT}
            x2={width - RIGHT}
            lines={ticks.map((v) => ({ y: y(v), label: kfmt(v) }))}
          />
          {rows.map((r) => {
            const cx = x(index(r.month));
            const w = slot * 0.56;
            const need = (r.needCents / 100 / hi) * (bottom - top);
            const want = (r.wantCents / 100 / hi) * (bottom - top);
            return (
              <g key={r.month}>
                <rect
                  x={cx - w / 2}
                  y={bottom - need}
                  width={w}
                  height={Math.max(0, need)}
                  fill="var(--need)"
                />
                <rect
                  x={cx - w / 2}
                  y={bottom - need - want}
                  width={w}
                  height={Math.max(0, want)}
                  fill={patternFill(prefix, 'want')}
                  stroke="var(--want)"
                  strokeWidth={0.5}
                />
              </g>
            );
          })}
          {incomePoints.length > 1 && <Line points={incomePoints} kind="actual" draw={false} />}
          {incomePoints.length === 1 && (
            <circle
              cx={incomePoints[0]![0]}
              cy={incomePoints[0]![1]}
              r={3.5}
              className="dot-actual"
            />
          )}
          {Array.from({ length: MONTH_SLOTS }, (_, i) => (
            <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="svg-label">
              {monthShort(`${year}-${String(i + 1).padStart(2, '0')}`)}
            </text>
          ))}
        </ChartSvg>
      )}
      <ul className="chart-legend" aria-hidden="true">
        <li>
          <i className="sw sw-need" />
          Bedarf
        </li>
        <li>
          <i className="sw sw-want" />
          Wunsch
        </li>
        <li>
          <svg viewBox="0 0 32 8">
            <line x1="0" x2="32" y1="4" y2="4" className="l-actual" />
          </svg>
          Einkommen
        </li>
      </ul>
    </div>
  );
}

/** Sheet 1 B: net worth at the start and at every month end. */
export function YearNetWorthChart({ netWorth }: { netWorth: YearNetWorth }) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const height = 170;
  const top = 12;
  const bottom = 138;
  const values = [netWorth.startCents, ...netWorth.months.map((m) => m.endCents)].map(
    (c) => c / 100,
  );
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.1 || 1;
  const a = lo - pad;
  const b = hi + pad;
  const plot = Math.max(1, width - LEFT - RIGHT);
  const x = (i: number) => LEFT + (i / Math.max(values.length - 1, 1)) * plot;
  const y = (v: number) => bottom - ((v - a) / (b - a)) * (bottom - top);
  const points: Point[] = values.map((v, i) => [x(i), y(v)]);
  const every = Math.max(1, Math.ceil(values.length / Math.max(2, Math.floor(plot / 52))));
  const label = `Nettovermögen: Anfang ${eur(netWorth.startCents, { cents: false })}, Ende ${eur(netWorth.endCents, { cents: false })}.`;
  return (
    <div ref={ref} className="ov-chart">
      {width > 0 && (
        <ChartSvg
          width={width}
          height={height}
          label={label}
          testId="yr-networth"
          points={chartPoints(
            [
              `Beginn ${chartDate(netWorth.months[0]?.month ?? '')}`,
              ...netWorth.months.map((m) => m.month),
            ],
            x,
            [
              {
                name: 'Nettovermögen',
                values: [netWorth.startCents, ...netWorth.months.map((m) => m.endCents)],
                color: 'var(--line)',
              },
            ],
          )}
        >
          <Graticule
            x1={LEFT}
            x2={width - RIGHT}
            lines={yTicks(a, b).map((v) => ({ y: y(v), label: kfmt(v) }))}
          />
          <Line points={points} kind="actual" draw={false} />
          <circle
            cx={x(values.length - 1)}
            cy={y(values[values.length - 1] as number)}
            r={3.5}
            className="dot-actual"
          />
          {values.map((_, i) =>
            (values.length - 1 - i) % every === 0 ? (
              <text key={i} x={x(i)} y={height - 8} textAnchor="middle" className="svg-label">
                {i === 0
                  ? 'Start'
                  : monthShortYear((netWorth.months[i - 1] as { month: string }).month)}
              </text>
            ) : null,
          )}
        </ChartSvg>
      )}
    </div>
  );
}
