import { forecastStepLabels } from './forecast-labels';
import { useId, useState, type CSSProperties } from 'react';
import { Info } from 'lucide-react';
import { chartPoints } from '../charts/tooltip-data';
import {
  useAmountPrivacy,
  AxisLine,
  ChartSvg,
  ElevationMark,
  SlashTick,
  Graticule,
  Line,
  LineLegend,
  StepLine,
  TodayLine,
  XTicks,
  type Point,
} from '@budget/ui';
import { scaleLinear } from 'd3-scale';
import { useElementWidth } from '../charts/use-element-width';
import { eur, eurParts, shortDay } from '../ledger/format';
import type { Heute } from './api';
import { addDays, daysBetween } from '@budget/domain';

const number = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });
const dayValue = (day: string) => Date.parse(`${day}T00:00:00Z`);

function useWidth() {
  return useElementWidth<HTMLDivElement>();
}

export function DailyBudgetLine({
  data,
  style,
}: {
  data: Pick<Heute, 'dailyBudget' | 'stand'>;
  style?: CSSProperties;
}) {
  useAmountPrivacy();
  const [explained, setExplained] = useState(false);
  const id = useId();
  const { remainingDays, perDayCents } = data.dailyBudget;
  return (
    <div
      className={`heute-daily-budget${perDayCents === null ? ' is-alarm' : ''}`}
      data-testid="heute-daily-budget"
      style={style}
    >
      <span>
        {perDayCents === null
          ? `Kein Spielraum bis zum Gehalt am ${shortDay(data.stand.payday.day)}`
          : `≈ ${eur(perDayCents, { cents: false })} pro Tag · noch ${remainingDays} ${remainingDays === 1 ? 'Tag' : 'Tage'} bis zum Gehalt`}
      </span>
      <span onMouseEnter={() => setExplained(true)} onMouseLeave={() => setExplained(false)}>
        <button
          type="button"
          aria-label="Tagesbudget erklären"
          aria-describedby={explained ? id : undefined}
          onFocus={() => setExplained(true)}
          onBlur={() => setExplained(false)}
          onClick={() => setExplained(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setExplained(false);
          }}
        >
          <Info size={16} aria-hidden="true" />
        </button>
        {explained && (
          <span id={id} role="tooltip" className="heute-daily-help">
            Frei verfügbar bis Gehalt geteilt durch die verbleibenden Tage einschließlich heute bis
            zum nächsten Gehalt (am Gehaltstag: ein Tag), auf ganze Euro gerundet.
          </span>
        )}
      </span>
    </div>
  );
}

/** Budget-account balance from the Heute read model; solid is observed, dashed is forecast. */
export function BalanceChart({
  data,
  chainOpen,
  onToggleChain,
  report = false,
}: {
  data: Heute;
  chainOpen: boolean;
  onToggleChain: () => void;
  report?: boolean;
}) {
  useAmountPrivacy();
  const [ref, width] = useWidth();
  const { actual, forecast } = data.balance;
  const all = [...actual, ...forecast];
  if (all.length === 0)
    return (
      <div ref={ref} className="heute-chart">
        <p className="heute-note">Kein Verlauf im gewählten Zeitraum.</p>
      </div>
    );
  return (
    <div ref={ref} className="heute-chart">
      {width > 0 && (
        <BalanceDrawing
          data={data}
          width={width}
          chainOpen={chainOpen}
          onToggleChain={onToggleChain}
          report={report}
        />
      )}
    </div>
  );
}

function BalanceDrawing({
  data,
  width,
  chainOpen,
  onToggleChain,
  report,
}: {
  data: Heute;
  width: number;
  chainOpen: boolean;
  onToggleChain: () => void;
  report: boolean;
}) {
  useAmountPrivacy();
  const [figureRef, figureWidth] = useElementWidth<HTMLButtonElement>();
  const narrow = width < 640;
  const labels = forecastStepLabels(data.balance.forecast);
  const dailySpace = report ? 0 : narrow ? 72 : 48;
  const height = (report ? (narrow ? 204 : 260) : narrow ? 232 : 330) + dailySpace;
  const top = (report ? 64 : narrow ? 104 : 140) + dailySpace;
  const bottom = height - (narrow ? 26 : 30);
  const left = narrow ? 40 : 48;
  const right = width - 10;
  const dimY = (report ? 30 : narrow ? 64 : 100) + dailySpace;
  const figure = eurParts(data.lead.freeCents);
  const { actual, forecast, low, salary } = data.balance;
  const days = [...actual, ...forecast];
  const start = Math.min(...days.map((d) => dayValue(d.day)));
  const end = Math.max(...days.map((d) => dayValue(d.day)));
  const span = Math.max(1, end - start);
  const values = days.map((d) => d.balanceCents);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(0, ...values);
  const padValue = Math.max((maxValue - minValue) * 0.12, 10_000);
  const yScale = scaleLinear()
    .domain([minValue - padValue, maxValue + padValue])
    .nice(4)
    .range([bottom, top]);
  const xScale = (day: string) => left + ((dayValue(day) - start) / span) * (right - left);
  const y = (value: number) => yScale(value);
  const actualPoints: Point[] = actual.map((d) => [xScale(d.day), y(d.balanceCents)]);
  const forecastPoints: Point[] = forecast.map((d) => [xScale(d.day), y(d.balanceCents)]);
  const ticks = yScale.ticks(4).map((v) => ({ y: y(v), label: number.format(v / 100) }));
  const todayInRange = dayValue(data.stand.today) >= start && dayValue(data.stand.today) <= end;
  const xTickDays = [days[0]?.day, ...(todayInRange ? [data.stand.today] : []), days.at(-1)?.day]
    .filter((v): v is string => Boolean(v))
    .filter((v, i, a) => a.indexOf(v) === i)
    .map((day) => ({
      x: xScale(day),
      label: day === data.stand.today ? 'heute' : shortDay(day),
    }));
  const label =
    `Budget-Konten: Ist bis ${data.stand.today} ${eur(actual.at(-1)?.balanceCents ?? 0)}; ` +
    (forecast.length
      ? `Prognose bis ${forecast.at(-1)?.day} ${eur(forecast.at(-1)?.balanceCents ?? 0)}.`
      : 'keine Prognose für diesen Zeitraum.');

  const payday =
    data.stand.period === 'payday' ? addDays(data.stand.to, -2) : data.stand.payday.day;
  const paydayInRange = dayValue(payday) >= start && dayValue(payday) <= end;
  const bracketDay = paydayInRange ? payday : days.at(-1)!.day;
  const bracketDays = daysBetween(data.stand.today, bracketDay);
  const x0 = todayInRange ? xScale(data.stand.today) : left;
  const x1 = paydayInRange ? xScale(payday) : right;
  const center = (x0 + x1) / 2;
  const dailyWidth = Math.min(width - 16, 500);
  return (
    <div className={`heute-balance-drawing${narrow ? ' is-narrow' : ''}`}>
      {!report && (
        <button
          ref={figureRef}
          type="button"
          className={`heute-lead-figure${data.lead.freeCents < 0 ? ' is-negative' : ''}`}
          data-testid="heute-lead-value"
          aria-label={`Frei verfügbar bis Gehalt: ${eur(data.lead.freeCents)}. Herleitung ${chainOpen ? 'ausblenden' : 'zeigen'}`}
          aria-expanded={chainOpen}
          aria-controls="heute-lead-chain"
          onClick={onToggleChain}
          style={{
            left: Math.min(Math.max(center - figureWidth / 2, left), width - figureWidth - 2),
            top: narrow ? 13 : 22,
          }}
        >
          <span>{figure.whole}</span>
          <small>,{figure.fraction} €</small>
        </button>
      )}
      {!report && (
        <DailyBudgetLine
          data={data}
          style={{
            left: Math.min(Math.max(center - dailyWidth / 2, 8), width - dailyWidth - 8),
            right: 'auto',
            width: dailyWidth,
          }}
        />
      )}
      <ChartSvg
        width={width}
        height={height}
        label={label}
        testId={report ? 'r07-balance-chart' : 'heute-balance-chart'}
        points={chartPoints(
          [...new Set(days.map((d) => d.day))].sort(),
          (i) => xScale([...new Set(days.map((d) => d.day))].sort()[i]!),
          [
            {
              name: 'Ist',
              values: [...new Set(days.map((d) => d.day))]
                .sort()
                .map((day) => actual.find((d) => d.day === day)?.balanceCents),
            },
            {
              name: 'Prognose',
              values: [...new Set(days.map((d) => d.day))]
                .sort()
                .map((day) => forecast.find((d) => d.day === day)?.balanceCents),
            },
          ],
        ).map((p) => {
          const day = forecast.find((d) => d.day === p.date);
          return {
            ...p,
            series: [
              ...p.series,
              ...(day?.items ?? []).map((i) => ({
                name: i.label ?? 'Geplante Zahlung',
                value: eur(i.cents, { sign: true }),
                color: i.cents < 0 ? 'var(--red)' : 'var(--line)',
              })),
              ...(day && day.variableCents > 0
                ? [
                    {
                      name: 'Variable Ausgaben',
                      value: eur(-day.variableCents, { sign: true }),
                      color: 'var(--ink-3)',
                    },
                  ]
                : []),
            ],
          };
        })}
      >
        <Graticule x1={left} x2={right} lines={ticks} />
        <AxisLine x1={left} x2={right} y={y(0)} />
        {dayValue(data.stand.today) >= start && dayValue(data.stand.today) <= end && (
          <TodayLine x={xScale(data.stand.today)} y1={dimY + 6} y2={bottom} />
        )}
        {actualPoints.length > 1 && <StepLine points={actualPoints} kind="actual" />}
        {forecastPoints.length > 1 && <StepLine points={forecastPoints} kind="forecast" />}
        {low && (
          <ElevationMark
            x={xScale(low.day)}
            y={y(low.cents)}
            shelf={low.day < data.stand.today ? 24 : narrow ? 40 : 48}
            label={`Tiefpunkt ${eur(low.cents, { cents: false })}${narrow ? '' : ` · ${shortDay(low.day)}`}`}
            align={xScale(low.day) < width / 2 ? 'start' : 'end'}
          />
        )}
        {salary && (
          <g>
            <line
              x1={xScale(salary.day)}
              x2={xScale(salary.day)}
              y1={top}
              y2={bottom}
              className="heute-salary-mark"
            />
          </g>
        )}
        {actualPoints.at(-1) && todayInRange && (
          <circle
            cx={actualPoints.at(-1)![0]}
            cy={actualPoints.at(-1)![1]}
            r={4}
            className="dot-actual"
          />
        )}
        {todayInRange && (
          <g className="heute-lead-dimension">
            <line x1={x1} x2={x1} y1={dimY - 8} y2={bottom} className="l-ext" />
            <line x1={x0} x2={x0} y1={dimY - 8} y2={dimY + 6} className="l-dim" />
            <line x1={x0 - 10} x2={x1 + 6} y1={dimY} y2={dimY} className="l-dim" />
            <SlashTick x={x0} y={dimY} size={9} />
            <SlashTick x={x1} y={dimY} size={9} />
            <text
              x={Math.min(center, width - (narrow ? 70 : 110))}
              y={(report ? 50 : narrow ? 82 : 120) + dailySpace}
              textAnchor="middle"
              className="svg-label-line"
            >
              {bracketDays} {bracketDays === 1 ? 'Tag' : 'Tage'} bis{' '}
              {paydayInRange ? `Gehalt ${shortDay(payday)}` : shortDay(bracketDay)}
            </text>
          </g>
        )}
        {[...new Set(labels.map((l) => l.day))].map((day) => {
          const point = forecast.find((d) => d.day === day)!;
          const numbers = labels.flatMap((l, i) => (l.day === day ? [i + 1] : [])).join(',');
          return (
            <g key={day}>
              <rect
                x={xScale(day) - numbers.length * 4 - 3}
                y={y(point.balanceCents) - 9}
                width={numbers.length * 8 + 6}
                height={18}
                fill="var(--surface)"
                stroke="var(--line)"
              />
              <text
                x={xScale(day)}
                y={y(point.balanceCents) + 4}
                textAnchor="middle"
                className="svg-label"
              >
                {numbers}
              </text>
            </g>
          );
        })}
        {xTickDays.map((tick) => (
          <text
            key={tick.label + tick.x}
            x={tick.x}
            y={height - 6}
            textAnchor="middle"
            className="svg-label"
          >
            {tick.label}
          </text>
        ))}
      </ChartSvg>
      {labels.length > 0 && (
        <ol className="forecast-step-labels" aria-label="Größte geplante Zahlungen">
          {labels.map((item, i) => (
            <li key={`${item.day}-${i}`} data-testid="forecast-step-label">
              <span>
                {i + 1}. {shortDay(item.day)} · {item.label}
              </span>
              <strong>{eur(item.cents, { sign: true })}</strong>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** What the pace chart reads: also fed by the Monats-One-Pager. */
export interface PaceChartData {
  pace: Heute['pace'];
  stand: { today: string };
}

export function HeutePaceChart({ data }: { data: PaceChartData }) {
  useAmountPrivacy();
  const [ref, width] = useWidth();
  return (
    <div ref={ref} className="heute-chart">
      {width > 0 && <PaceDrawing data={data} width={width} />}
    </div>
  );
}

function PaceDrawing({ data, width }: { data: PaceChartData; width: number }) {
  useAmountPrivacy();
  const m = data.pace;
  const height = width < 640 ? 200 : 250;
  const narrow = width < 520;
  const left = 44;
  const right = narrow ? 52 : 92;
  const bottom = height - 30;
  const max = Math.max(
    m.figures.limitCents,
    ...m.plan,
    ...m.actual,
    ...m.previous,
    ...m.forecast,
    ...(m.income ?? []),
    1,
  );
  const min = Math.min(0, ...m.actual, ...m.previous);
  const yScale = scaleLinear().domain([min, max]).nice(4).range([bottom, 20]);
  const xScale = (day: number) =>
    left + (day / Math.max(1, m.daysInMonth)) * (width - left - right);
  const y = (value: number) => yScale(value);
  const pts = (values: number[], offset = 0) =>
    values.map((v, i): Point => [xScale(i + offset), y(v)]);
  const actual = pts(m.actual);
  const income = pts(m.income ?? []);
  const plan = pts(m.plan);
  const previous = pts(m.previous);
  const forecast = pts(m.forecast, m.todayDay);
  const limitY = y(m.figures.limitCents);
  const ticks = yScale.ticks(4).map((v) => ({ y: y(v), label: number.format(v / 100) }));
  const currentMonth = data.stand.today.slice(0, 7) === m.month;
  const xTicks = [
    1,
    Math.ceil(m.daysInMonth / 4),
    Math.ceil(m.daysInMonth / 2),
    Math.ceil((m.daysInMonth * 3) / 4),
    m.daysInMonth,
  ]
    .filter((d, i, a) => a.indexOf(d) === i)
    .map((d) => ({ x: xScale(d), label: `${d}.` }));
  if (currentMonth && m.todayDay > 0) xTicks.push({ x: xScale(m.todayDay), label: 'heute' });
  const summary = `Pace ${m.month}: ausgegeben ${eur(m.figures.spentCents)}, Plan bis heute ${eur(m.figures.planToDateCents)}, Prognose Monatsende ${m.figures.forecastAvailable ? eur(m.figures.forecastEndCents) : 'noch nicht verlässlich'} von ${eur(m.figures.limitCents)}.`;
  return (
    <>
      <ChartSvg
        width={width}
        height={height}
        label={summary}
        testId="heute-pace-chart"
        points={chartPoints(
          m.plan.map((_, i) =>
            i === 0 ? `Beginn ${m.month}` : `${m.month}-${String(i).padStart(2, '0')}`,
          ),
          xScale,
          [
            { name: 'Ausgaben bis dahin', values: m.actual },
            { name: 'Einnahmen bis dahin', values: m.income ?? [], color: 'var(--future)' },
            {
              name: 'Differenz',
              values: m.actual.map((v, i) => (m.income?.[i] ?? 0) - v),
              color: 'var(--ink)',
            },
            { name: 'Plan', values: m.plan, color: 'var(--line-2)' },
            { name: 'Vormonat', values: m.previous, color: 'var(--ink-3)' },
            {
              name: 'Prognose',
              values: m.plan.map((_, i) => (i < m.todayDay ? null : m.forecast[i - m.todayDay])),
            },
            {
              name: 'Limit',
              values: m.plan.map(() => m.figures.limitCents),
              color: 'var(--rule-strong)',
            },
          ],
        )}
      >
        <Graticule x1={left} x2={width - right} lines={ticks} />
        <AxisLine x1={left} x2={width - right} y={y(0)} />
        <AxisLine x1={left} x2={width - right} y={limitY} />
        <text x={width - right + 5} y={limitY + 4} className="svg-label">
          {narrow ? 'Limit' : `Limit ${eur(m.figures.limitCents, { cents: false })}`}
        </text>
        {previous.length > 1 && <Line points={previous} kind="previous" />}
        {plan.length > 1 && <Line points={plan} kind="plan" />}
        {actual.length > 1 && <StepLine points={actual} kind="actual" />}
        {income.length > 1 && (
          <StepLine points={income} kind="actual" className="pace-income-line" />
        )}
        {forecast.length > 1 && <Line points={forecast} kind="forecast" />}
        {currentMonth && m.todayDay > 0 && <TodayLine x={xScale(m.todayDay)} y1={20} y2={bottom} />}
        <XTicks y={height - 7} ticks={xTicks} />
      </ChartSvg>
      <LineLegend
        items={[
          ...(actual.length > 1 ? [{ kind: 'actual' as const, label: 'Ausgaben' }] : []),
          ...(income.length > 1
            ? [{ kind: 'actual' as const, label: 'Einnahmen', className: 'pace-income-line' }]
            : []),
          ...(plan.length > 1 ? [{ kind: 'plan' as const, label: 'Plan' }] : []),
          ...(forecast.length > 1 ? [{ kind: 'forecast' as const, label: 'Prognose' }] : []),
          ...(previous.length > 1
            ? [
                {
                  kind: 'previous' as const,
                  label: `${monthShort(data.pace.previousMonth)} · Vormonat`,
                },
              ]
            : []),
        ]}
      />
    </>
  );
}

function monthShort(month: string) {
  return new Intl.DateTimeFormat('de-AT', { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${month}-15T12:00:00Z`),
  );
}
