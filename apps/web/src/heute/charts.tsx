import {
  AxisLine,
  ChartSvg,
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
import { eur } from '../ledger/format';
import type { Heute } from './api';

const HEIGHT = 292;
const number = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });
const dayValue = (day: string) => Date.parse(`${day}T00:00:00Z`);

function useWidth() {
  return useElementWidth<HTMLDivElement>();
}

/** Budget-account balance from the Heute read model; solid is observed, dashed is forecast. */
export function BalanceChart({ data }: { data: Heute }) {
  const [ref, width] = useWidth();
  const { actual, forecast } = data.balance;
  const all = [...actual, ...forecast];
  if (all.length === 0) return <div ref={ref} className="heute-chart" />;
  return (
    <div ref={ref} className="heute-chart">
      {width > 0 && <BalanceDrawing data={data} width={width} />}
    </div>
  );
}

function BalanceDrawing({ data, width }: { data: Heute; width: number }) {
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
    .range([HEIGHT - 30, 22]);
  const xScale = (day: string) => 52 + ((dayValue(day) - start) / span) * (width - 120);
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
      label: day === data.stand.today ? 'heute' : `${day.slice(8, 10)}.`,
    }));
  const label =
    `Budget-Konten: Ist bis ${data.stand.today} ${eur(actual.at(-1)?.balanceCents ?? 0)}; ` +
    (forecast.length
      ? `Prognose bis ${forecast.at(-1)?.day} ${eur(forecast.at(-1)?.balanceCents ?? 0)}.`
      : 'keine Prognose für diesen Zeitraum.');

  return (
    <ChartSvg width={width} height={HEIGHT} label={label} testId="heute-balance-chart">
      <Graticule x1={52} x2={width - 68} lines={ticks} />
      <AxisLine x1={52} x2={width - 68} y={y(0)} />
      {dayValue(data.stand.today) >= start && dayValue(data.stand.today) <= end && (
        <TodayLine x={xScale(data.stand.today)} y1={22} y2={HEIGHT - 30} />
      )}
      {actualPoints.length > 1 && <StepLine points={actualPoints} kind="actual" />}
      {forecastPoints.length > 1 && <Line points={forecastPoints} kind="forecast" />}
      {low && (
        <g>
          <path
            d={`M${xScale(low.day)} ${y(low.cents) - 16}l-5 -8h10z`}
            className="heute-low-mark"
          />
          <text
            x={xScale(low.day)}
            y={y(low.cents) - 28}
            textAnchor="middle"
            className="svg-label-line"
          >
            Tiefpunkt {eur(low.cents)} · {low.day.slice(8, 10)}.
          </text>
        </g>
      )}
      {salary && (
        <g>
          <line
            x1={xScale(salary.day)}
            x2={xScale(salary.day)}
            y1={22}
            y2={HEIGHT - 30}
            className="heute-salary-mark"
          />
          <text
            x={Math.min(width - 6, xScale(salary.day) - 4)}
            y={35}
            textAnchor="end"
            className="svg-label-line"
          >
            Gehalt +{eur(salary.cents)}
          </text>
        </g>
      )}
      {xTickDays.map((tick) => (
        <text
          key={tick.label + tick.x}
          x={tick.x}
          y={HEIGHT - 6}
          textAnchor="middle"
          className="svg-label"
        >
          {tick.label}
        </text>
      ))}
    </ChartSvg>
  );
}

export function HeutePaceChart({ data }: { data: Heute }) {
  const [ref, width] = useWidth();
  return (
    <div ref={ref} className="heute-chart">
      {width > 0 && <PaceDrawing data={data} width={width} />}
    </div>
  );
}

function PaceDrawing({ data, width }: { data: Heute; width: number }) {
  const m = data.pace;
  const narrow = width < 520;
  const left = 44;
  const right = narrow ? 52 : 92;
  const bottom = HEIGHT - 30;
  const max = Math.max(
    m.figures.limitCents,
    ...m.plan,
    ...m.actual,
    ...m.previous,
    ...m.forecast,
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
  const summary = `Pace ${m.month}: ausgegeben ${eur(m.figures.spentCents)}, Plan bis heute ${eur(m.figures.planToDateCents)}, Prognose Monatsende ${eur(m.figures.forecastEndCents)} von ${eur(m.figures.limitCents)}.`;
  return (
    <>
      <ChartSvg width={width} height={HEIGHT} label={summary} testId="heute-pace-chart">
        <Graticule x1={left} x2={width - right} lines={ticks} />
        <AxisLine x1={left} x2={width - right} y={y(0)} />
        <AxisLine x1={left} x2={width - right} y={limitY} />
        <text x={width - right + 5} y={limitY + 4} className="svg-label">
          {narrow ? 'Limit' : `Limit ${eur(m.figures.limitCents, { cents: false })}`}
        </text>
        {previous.length > 1 && <Line points={previous} kind="previous" />}
        {plan.length > 1 && <Line points={plan} kind="plan" />}
        {actual.length > 1 && <StepLine points={actual} kind="actual" />}
        {forecast.length > 1 && <Line points={forecast} kind="forecast" />}
        {currentMonth && m.todayDay > 0 && <TodayLine x={xScale(m.todayDay)} y1={20} y2={bottom} />}
        <XTicks y={HEIGHT - 7} ticks={xTicks} />
      </ChartSvg>
      <LineLegend
        items={[
          { kind: 'actual', label: 'Ist' },
          { kind: 'plan', label: 'Plan' },
          { kind: 'forecast', label: 'Prognose' },
          { kind: 'previous', label: `${monthShort(data.pace.previousMonth)} · Vormonat` },
        ]}
      />
    </>
  );
}

export function NetWorthMiniChart({ series }: { series: Heute['netWorth']['series'] }) {
  const [ref, width] = useWidth();
  const values = series.map((p) => p.cents);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0);
  const yScale = scaleLinear().domain([min, max]).nice(3).range([92, 12]);
  const points = series.map((p, i): Point => [
    24 + (i / Math.max(1, series.length - 1)) * Math.max(0, width - 40),
    yScale(p.cents),
  ]);
  const label = `Nettovermögen: ${series.length} Stände, zuletzt ${eur(series.at(-1)?.cents ?? 0)} am ${series.at(-1)?.day ?? ''}.`;
  return (
    <div ref={ref} className="heute-mini-chart">
      {width > 0 && (
        <ChartSvg width={width} height={106} label={label} testId="heute-networth-chart">
          {points.length > 1 && <Line points={points} kind="actual" />}
          {points.at(-1) && (
            <circle cx={points.at(-1)![0]} cy={points.at(-1)![1]} r={3.5} className="dot-actual" />
          )}
          <text x={24} y={104} className="svg-label">
            {series[0]?.day.slice(0, 7)}
          </text>
          <text x={width - 16} y={104} textAnchor="end" className="svg-label-line">
            heute
          </text>
        </ChartSvg>
      )}
    </div>
  );
}

function monthShort(month: string) {
  return new Intl.DateTimeFormat('de-AT', { month: 'long', timeZone: 'UTC' }).format(
    new Date(`${month}-15T12:00:00Z`),
  );
}
