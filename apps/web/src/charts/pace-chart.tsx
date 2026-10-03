import {
  useAmountPrivacy,
  formatPrivateEuro as formatEuro,
  AxisLine,
  ChartSvg,
  DimensionLine,
  Graticule,
  Line,
  StepLine,
  TodayLine,
  XTicks,
  LineLegend,
  type Point,
} from '@budget/ui';
import { cents } from '@budget/domain/money';
import { scaleLinear } from 'd3-scale';
import { DAYS, LIMIT, TODAY, paceModel } from './pace-model';

const HEIGHT = 300;
const eur0 = (v: number) => formatEuro(cents(Math.round(v)), { cents: false });
const axisNumber = new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 });

/**
 * Heute pace chart: cumulative spending of the month, composed from the chart primitives of
 * packages/ui. Solid = actual (step line), dashed = plan and forecast, dash-dot = previous month.
 */
export function PaceChart({ width }: { width: number }) {
  useAmountPrivacy();
  if (width <= 0) return null;
  const model = paceModel();
  const narrow = width < 520;
  const padL = 40;
  const padR = narrow ? 56 : 92;
  const top = 14;
  const bottom = HEIGHT - 24;

  const x = scaleLinear()
    .domain([0, DAYS])
    .range([padL, width - padR]);
  const y = scaleLinear().domain([0, 360000]).range([bottom, top]);
  const pt = (day: number, value: number): Point => [x(day), y(value)];

  const days = Array.from({ length: DAYS + 1 }, (_, d) => d);
  const previous = days.map((d) => pt(d, model.previous(d)));

  // Plan: linear variable share between fixed-cost days, vertical jump on each fixed-cost day.
  const plan: Point[] = [pt(0, 0)];
  for (let d = 1; d <= DAYS; d++) {
    plan.push(pt(d, model.plan(d - 1) + model.variablePlanPerDay));
    if (model.fixedDays.includes(d)) plan.push(pt(d, model.plan(d)));
  }

  // Actual: step line, the value changes on the day of the booking.
  const actual: Point[] = [pt(0, 0)];
  for (let d = 1; d <= TODAY; d++) actual.push(pt(d, model.actual(d)));

  const actualToday = model.actual(TODAY);
  const planToday = model.plan(TODAY);
  const delta = actualToday - planToday;
  const forecast = [pt(TODAY, actualToday), pt(DAYS, model.forecastEnd)];
  const labelDays = [1, 8, 15, 22, 30].filter((d) => Math.abs(d - TODAY) >= (narrow ? 4 : 2));

  const summary =
    `Ausgaben kumuliert: ${eur0(actualToday)} bis heute gegen Plan ${eur0(planToday)}, ` +
    `Prognose Monatsende ${eur0(model.forecastEnd)} von ${eur0(LIMIT)} Limit.`;
  const dimX = x(TODAY) - 12;

  return (
    <ChartSvg width={width} height={HEIGHT} label={summary} testId="pace-chart">
      <Graticule
        x1={padL}
        x2={width - padR}
        lines={[100000, 200000, 300000].map((v) => ({
          y: y(v),
          label: axisNumber.format(v / 100),
        }))}
      />
      <AxisLine x1={padL} x2={width - padR} y={y(0)} />
      <AxisLine x1={padL} x2={width - padR} y={y(LIMIT)} />
      <text x={width - padR + 6} y={y(LIMIT) + 4} className="svg-label">
        {narrow ? 'Limit' : `Limit ${eur0(LIMIT)}`}
      </text>
      <XTicks
        y={bottom + 17}
        ticks={[
          ...labelDays.map((d) => ({ x: x(d), label: `${d}.` })),
          { x: x(TODAY), label: 'heute', emphasis: true },
        ]}
      />
      <TodayLine x={x(TODAY)} y1={top} y2={bottom} />

      <Line points={previous} kind="previous" />
      <Line points={plan} kind="plan" />
      <StepLine points={actual} kind="actual" />
      <Line points={forecast} kind="forecast" />
      <circle cx={x(DAYS)} cy={y(model.forecastEnd)} r={3.5} className="dot-actual" />
      <text x={x(DAYS) + 8} y={y(model.forecastEnd) + 4} className="svg-label-strong">
        {narrow ? String(Math.round(model.forecastEnd / 100)) : eur0(model.forecastEnd)}
      </text>
      <circle cx={x(TODAY)} cy={y(actualToday)} r={4} className="dot-actual" />

      {/* Dimensioned gap between actual and plan (Maßlinie with slash terminators). */}
      <DimensionLine
        orientation="vertical"
        from={y(planToday)}
        to={y(actualToday)}
        at={dimX}
        extend={x(TODAY)}
        alert={delta > 0}
      />
      <text
        x={x(TODAY) + 10}
        y={y(actualToday) + 24}
        className={delta > 0 ? 'svg-label-red' : 'svg-label-line'}
      >
        {`${eur0(Math.abs(delta))} ${delta > 0 ? 'über' : 'unter'} Plan`}
      </text>
    </ChartSvg>
  );
}

export function PaceLegend() {
  useAmountPrivacy();
  return (
    <LineLegend
      items={[
        { kind: 'actual', label: 'Ist' },
        { kind: 'plan', label: 'Plan' },
        { kind: 'forecast', label: 'Prognose' },
        { kind: 'previous', label: 'Vormonat' },
      ]}
    />
  );
}
