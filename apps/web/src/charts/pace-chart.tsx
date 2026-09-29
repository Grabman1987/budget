import { cents, formatEuro } from '@budget/domain/money';
import { scaleLinear } from 'd3-scale';
import { line } from 'd3-shape';
import { DAYS, LIMIT, TODAY, paceModel } from './pace-model';

const HEIGHT = 300;
const eur0 = (v: number) => formatEuro(cents(Math.round(v)), { cents: false });

/**
 * Heute pace chart: cumulative spending of the month.
 * Solid = actual (step line), dashed = plan and forecast, dash-dot = previous month.
 * Own SVG on d3-scale/d3-shape, ported from `renderPace` in `design/prototype/app.js`.
 */
export function PaceChart({ width }: { width: number }) {
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
  const path = line<[number, number]>()
    .x((p) => x(p[0]))
    .y((p) => y(p[1]));

  const days = Array.from({ length: DAYS + 1 }, (_, d) => d);
  const previousPath = path(days.map((d) => [d, model.previous(d)]));

  // Plan: linear variable share between fixed-cost days, vertical jump on each fixed-cost day.
  const planPoints: [number, number][] = [[0, 0]];
  for (let d = 1; d <= DAYS; d++) {
    const before = model.plan(d - 1) + model.variablePlanPerDay;
    planPoints.push([d, before]);
    if (model.fixedDays.includes(d)) planPoints.push([d, model.plan(d)]);
  }
  const planPath = path(planPoints);

  // Actual: step line up to today.
  const actualPoints: [number, number][] = [[0, 0]];
  for (let d = 1; d <= TODAY; d++) {
    actualPoints.push([d, model.actual(d - 1)], [d, model.actual(d)]);
  }
  const actualPath = path(actualPoints);

  const actualToday = model.actual(TODAY);
  const planToday = model.plan(TODAY);
  const delta = actualToday - planToday;
  const forecastPath = path([
    [TODAY, actualToday],
    [DAYS, model.forecastEnd],
  ]);

  const dimX = x(TODAY) - 12;
  const labelDays = [1, 8, 15, 22, 30].filter((d) => Math.abs(d - TODAY) >= (narrow ? 4 : 2));
  const tick = (cx: number, cy: number) => (
    <path d={`M${cx - 3.5} ${cy + 3.5} L${cx + 3.5} ${cy - 3.5}`} className="l-tick" />
  );

  const summary =
    `Ausgaben kumuliert: ${eur0(actualToday)} bis heute gegen Plan ${eur0(planToday)}, ` +
    `Prognose Monatsende ${eur0(model.forecastEnd)} von ${eur0(LIMIT)} Limit.`;

  return (
    <svg
      viewBox={`0 0 ${width} ${HEIGHT}`}
      width={width}
      height={HEIGHT}
      role="img"
      aria-label={summary}
      data-testid="pace-chart"
    >
      {[100000, 200000, 300000].map((v) => (
        <g key={v}>
          <line x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} className="graticule" />
          <text x={padL - 8} y={y(v) + 4} textAnchor="end" className="svg-label">
            {new Intl.NumberFormat('de-AT', { maximumFractionDigits: 0 }).format(v / 100)}
          </text>
        </g>
      ))}
      <line x1={padL} x2={width - padR} y1={y(0)} y2={y(0)} className="axis" />
      <line x1={padL} x2={width - padR} y1={y(LIMIT)} y2={y(LIMIT)} className="axis" />
      <text x={width - padR + 6} y={y(LIMIT) + 4} className="svg-label">
        {narrow ? 'Limit' : `Limit ${eur0(LIMIT)}`}
      </text>

      {labelDays.map((d) => (
        <text key={d} x={x(d)} y={bottom + 17} textAnchor="middle" className="svg-label">
          {d}.
        </text>
      ))}
      <text x={x(TODAY)} y={bottom + 17} textAnchor="middle" className="svg-label-line">
        heute
      </text>
      <line x1={x(TODAY)} x2={x(TODAY)} y1={top} y2={bottom} className="l-today" />

      <path d={previousPath ?? ''} className="l-prev" />
      <path d={planPath ?? ''} className="l-plan" />
      <path d={actualPath ?? ''} className="l-actual" />
      <path d={forecastPath ?? ''} className="l-forecast" />
      <circle cx={x(DAYS)} cy={y(model.forecastEnd)} r={3.5} className="dot-actual" />
      <text x={x(DAYS) + 8} y={y(model.forecastEnd) + 4} className="svg-label-strong">
        {narrow ? String(Math.round(model.forecastEnd / 100)) : eur0(model.forecastEnd)}
      </text>
      <circle cx={x(TODAY)} cy={y(actualToday)} r={4} className="dot-actual" />

      {/* Dimensioned gap between actual and plan (Maßlinie with slash terminators). */}
      <line x1={dimX - 4} x2={x(TODAY)} y1={y(planToday)} y2={y(planToday)} className="l-ext" />
      <line x1={dimX - 4} x2={x(TODAY)} y1={y(actualToday)} y2={y(actualToday)} className="l-ext" />
      <line
        x1={dimX}
        x2={dimX}
        y1={y(planToday)}
        y2={y(actualToday)}
        className={delta > 0 ? 'l-dim l-dim-alert' : 'l-dim'}
      />
      {tick(dimX, y(planToday))}
      {tick(dimX, y(actualToday))}
      <text
        x={x(TODAY) + 10}
        y={y(actualToday) + 24}
        className={delta > 0 ? 'svg-label-red' : 'svg-label-line'}
      >
        {`${eur0(Math.abs(delta))} ${delta > 0 ? 'über' : 'unter'} Plan`}
      </text>
    </svg>
  );
}

export function PaceLegend() {
  const item = (cls: string, label: string) => (
    <li>
      <svg aria-hidden="true" viewBox="0 0 32 8">
        <line x1="0" x2="32" y1="4" y2="4" className={cls} />
      </svg>
      {label}
    </li>
  );
  return (
    <ul className="chart-legend">
      {item('l-actual', 'Ist')}
      {item('l-plan', 'Plan')}
      {item('l-forecast', 'Prognose')}
      {item('l-prev', 'Vormonat')}
    </ul>
  );
}
