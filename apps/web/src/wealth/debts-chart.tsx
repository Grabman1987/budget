import {
  AxisLine,
  ChartSvg,
  Graticule,
  Line,
  LineLegend,
  TodayLine,
  XTicks,
  maskMoneyText,
  useAmountPrivacy,
  type ChartTooltipPoint,
  type Point,
} from '@budget/ui';
import { lastDayOfMonth, type LoanSchedule } from '@budget/domain';
import { useElementWidth } from '../charts/use-element-width';
import type { SeriesPoint } from '../ledger/types';
import { longDay, nativeCurrency } from '../ledger/format';
import type { LoanPlanView } from './loan-planning-api';
import { kfmt, yTicks } from './networth-model';

type Observation = { date: string; amount: number };
const dayNumber = (date: string) => Date.parse(`${date}T00:00:00Z`);
const monthNumber = (date: string) => Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7));

/** Geometry only: exact selected-account observations and the canonical monthly schedules. */
export function DebtChart({ basis, history, baseline, scenario }: {
  basis: LoanPlanView;
  history: readonly SeriesPoint[];
  baseline: LoanSchedule | null;
  scenario: LoanSchedule | null;
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const anchor = { date: basis.asOf, amount: basis.balanceCents };
  const actual = [...history.map((point) => ({ date: point.date, amount: -point.balanceCents })), anchor];
  const model = (schedule: LoanSchedule | null): Observation[] => schedule
    ? [anchor, ...schedule.rows.map((row) => ({ date: lastDayOfMonth(row.month), amount: row.closingCents }))]
    : [];
  const base = model(baseline);
  const extra = model(scenario);
  const all = [...actual, ...base, ...extra];
  const from = Math.min(...all.map((point) => dayNumber(point.date)));
  const to = Math.max(...all.map((point) => dayNumber(point.date)));
  const low = Math.min(0, ...all.map((point) => point.amount));
  const high = Math.max(1, ...all.map((point) => point.amount)) * 1.08;
  const height = width < 500 ? 240 : 280;
  const left = 56, right = Math.max(left + 1, width - 16);
  const x = (date: string) => left + ((dayNumber(date) - from) / (to - from || 1)) * (right - left);
  const y = (amount: number) => height - 34 - ((amount - low) / (high - low)) * (height - 60);
  const line = (points: readonly Observation[]): Point[] => points.map((point) => [x(point.date), y(point.amount)]);
  const segments: Observation[][] = [];
  for (const point of actual) {
    const segment = segments.at(-1);
    if (!segment || monthNumber(point.date) - monthNumber(segment.at(-1)!.date) > 1)
      segments.push([point]);
    else segment.push(point);
  }
  // One inspection target per date retains every current/start/month-end value at coincident dates.
  const byDate = new Map<string, ChartTooltipPoint>();
  const add = (point: Observation, name: string) => {
    const known = byDate.get(point.date);
    byDate.set(point.date, {
      date: point.date,
      x: x(point.date),
      series: [...(known?.series ?? []), { name, value: nativeCurrency(point.amount, basis.currency) }],
    });
  };
  history.forEach((point) => add({ date: point.date, amount: -point.balanceCents }, 'Ist · tatsächliches Monatsende'));
  add(anchor, 'Aktuelle Restschuld · Stichtag, vor Modellzahlungen');
  for (const [label, schedule] of [['Basis', baseline], ['Live-Szenario', scenario]] as const) {
    if (!schedule) continue;
    add(anchor, `${label} · Ausgangspunkt`);
    schedule.rows.forEach((row) => add({ date: lastDayOfMonth(row.month), amount: row.closingCents }, `${label} · nach Modellzahlung am Monatsende`));
  }
  const inspection = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
  const ticks = [from, from + (to - from) / 2, to].filter((value, i, values) => values.indexOf(value) === i);
  return (
    <div ref={ref} className="debt-chart">
      {width > 0 && (
        <ChartSvg width={width} height={height}
          label={`Restschuld ${maskMoneyText(basis.name)} in ${basis.currency}: tatsächliche Monatsenden, Kontostand ${longDay(basis.asOf)} und getrennte monatliche Tilgungsmodelle.`}
          testId="debt-chart" points={inspection} table
          tooltipNote="Ist sind echte Monatsendwerte. Der Stichtag ist vor Modellzahlungen; am gleichen Datum kann daneben eine Modellzahlung zum Monatsende stehen. Zwischen beobachteten Werten werden keine neuen Finanzdaten berechnet.">
          <Graticule x1={left} x2={right} lines={yTicks(low / 100, high / 100).map((value) => ({ y: y(value * 100), label: kfmt(value) }))} />
          <AxisLine x1={left} x2={right} y={y(0)} />
          <TodayLine x={x(basis.asOf)} y1={16} y2={height - 34} />
          {segments.map((segment) => <Line key={segment[0]!.date} points={line(segment)} kind="actual" draw={false} />)}
          {actual.map((point) => <circle key={point.date} cx={x(point.date)} cy={y(point.amount)} r={3} fill="var(--ink)" />)}
          {base.length > 1 && <Line points={line(base)} kind="plan" draw={false} />}
          {extra.length > 1 && <Line points={line(extra)} kind="forecast" draw={false} />}
          {([['Basis', baseline], ['Szenario', scenario]] as const).map(([label, schedule], index) => {
            if (!schedule?.payoffMonth) return null;
            const date = lastDayOfMonth(schedule.payoffMonth);
            const position = x(date);
            return <g key={label}>
              <path d={`M${position - 5},${y(0) - 9}h10l-5,8Z`} className="kote" />
              <text x={position} y={y(0) - 16 - index * 16} textAnchor={position > right - 80 ? 'end' : 'start'} className="svg-label">
                {label}: {schedule.payoffMonth.slice(5)}.{schedule.payoffMonth.slice(0, 4)}
              </text>
            </g>;
          })}
          <XTicks y={height - 8} ticks={ticks.map((value) => ({
            x: left + ((value - from) / (to - from || 1)) * (right - left),
            label: new Intl.DateTimeFormat('de-AT', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(value)),
          }))} />
        </ChartSvg>
      )}
      <LineLegend items={[
        { kind: 'actual', label: 'Ist des ausgewählten Kredits' },
        ...(baseline ? [{ kind: 'plan' as const, label: 'Basis ohne Sondertilgung' }] : []),
        ...(scenario ? [{ kind: 'forecast' as const, label: 'Live-Szenario mit Sondertilgung' }] : []),
      ]} />
    </div>
  );
}
