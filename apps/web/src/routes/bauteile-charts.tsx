import { chartPoints } from '../charts/tooltip-data';
import {
  useAmountPrivacy,
  AxisLine,
  Band,
  BarsAroundZero,
  ChartSvg,
  ClassPatterns,
  DimensionLine,
  ElevationMark,
  Graticule,
  Line,
  LineLegend,
  StepLine,
  TodayLine,
  XTicks,
  patternFill,
  usePatternPrefix,
  type Point,
} from '@budget/ui';
import { scaleBand, scaleLinear } from 'd3-scale';
import { useElementWidth } from '../charts/use-element-width';

/** Synthetic sample series for the chart primitives (values are plain chart units). */
const DAYS = 30;
const actual = Array.from(
  { length: 18 },
  (_, d) => 60 + d * 4 + Math.sin(d / 2) * 6 + (d > 9 ? 14 : 0),
);
const plan = Array.from({ length: DAYS + 1 }, (_, d) => 60 + d * 5);
const previous = Array.from({ length: DAYS + 1 }, (_, d) => 60 + d * 4.4 + Math.cos(d / 3) * 5);
const forecast: Array<[number, number]> = [
  [17, actual[17] ?? 0],
  [30, 205],
];
const months = ['J', 'F', 'M', 'A', 'M', 'J', 'J', 'A', 'S', 'O', 'N', 'D'];
const own = [12, 8, 15, 10, -6, 14, 9, 11, 7, 13, 5, 16];
const market = [4, -9, 6, -3, 8, -12, 5, 9, -4, 7, 3, -6];

const HEIGHT = 260;

function LineTypes({ width }: { width: number }) {
  useAmountPrivacy();
  const padL = 40;
  const padR = 20;
  const top = 12;
  const bottom = HEIGHT - 24;
  const x = scaleLinear()
    .domain([0, DAYS])
    .range([padL, width - padR]);
  const y = scaleLinear().domain([0, 240]).range([bottom, top]);
  const pts = (series: number[]): Point[] => series.map((v, d) => [x(d), y(v)]);
  const lowIndex = actual.indexOf(Math.min(...actual.slice(3)));
  return (
    <ChartSvg
      width={width}
      height={HEIGHT}
      label="Linienarten: Ist, Plan, Prognose, Vormonat"
      testId="chart-lines"
      points={chartPoints(
        plan.map((_, d) => `2026-09-${String(Math.max(1, d)).padStart(2, '0')}`),
        (i) => x(i),
        [
          { name: 'Ist', values: actual, color: 'var(--line)', format: String },
          { name: 'Plan', values: plan, color: 'var(--line)', format: String },
          { name: 'Vormonat', values: previous, color: 'var(--ink-3)', format: String },
          {
            name: 'Prognose',
            values: plan.map((_, d) =>
              d < 17 ? null : (actual[17] ?? 0) + ((205 - (actual[17] ?? 0)) * (d - 17)) / 13,
            ),
            color: 'var(--line)',
            format: String,
          },
        ],
      )}
    >
      <Graticule
        x1={padL}
        x2={width - padR}
        lines={[60, 120, 180].map((v) => ({ y: y(v), label: String(v) }))}
      />
      <AxisLine x1={padL} x2={width - padR} y={y(0)} />
      <XTicks
        y={bottom + 17}
        ticks={[
          { x: x(1), label: '1.' },
          { x: x(8), label: '8.' },
          { x: x(17), label: 'heute', emphasis: true },
          { x: x(24), label: '24.' },
          { x: x(30), label: '30.' },
        ]}
      />
      <TodayLine x={x(17)} y1={top} y2={bottom} />
      <Line kind="previous" points={pts(previous)} />
      <Line kind="plan" points={pts(plan)} />
      <StepLine kind="actual" points={pts(actual)} />
      <Line kind="forecast" points={forecast.map(([d, v]) => [x(d), y(v)] as Point)} />
      <DimensionLine
        orientation="vertical"
        from={y(plan[17] ?? 0)}
        to={y(actual[17] ?? 0)}
        at={x(17) - 12}
        extend={x(17)}
      />
      <ElevationMark
        x={x(lowIndex)}
        y={y(actual[lowIndex] ?? 0)}
        label="Tiefpunkt"
        shelf={40}
        align="start"
      />
    </ChartSvg>
  );
}

function BarsAndBand({ width }: { width: number }) {
  useAmountPrivacy();
  const padL = 40;
  const padR = 12;
  const top = 12;
  const bottom = HEIGHT - 28;
  const x = scaleBand<string>()
    .domain(months.map((_, i) => String(i)))
    .range([padL, width - padR])
    .padding(0.3);
  const y = scaleLinear().domain([-20, 20]).range([bottom, top]);
  const cx = (i: number) => (x(String(i)) ?? 0) + x.bandwidth() / 2;
  const half = x.bandwidth() / 2 - 1;
  return (
    <ChartSvg
      width={width}
      height={HEIGHT}
      label="Balken um Null mit Toleranzband"
      testId="chart-bars"
      points={chartPoints(
        months.map((_, i) => `2026-${String(i + 1).padStart(2, '0')}`),
        (i) => cx(i),
        [
          {
            name: 'Eigenleistung',
            values: own,
            color: 'var(--line)',
            negativeColor: 'var(--red)',
            format: String,
          },
          {
            name: 'Markt',
            values: market,
            color: 'var(--line-2)',
            negativeColor: 'var(--red)',
            format: String,
          },
        ],
      )}
    >
      <Graticule
        x1={padL}
        x2={width - padR}
        lines={[-10, 10].map((v) => ({ y: y(v), label: `${v > 0 ? '+' : '−'}${Math.abs(v)}` }))}
      />
      <Band points={months.map((_, i) => ({ x: cx(i), y0: y(-14), y1: y(-8) }))} />
      <BarsAroundZero
        bars={own.map((v, i) => ({ x: cx(i) - half / 2, value: v, title: `Eigenleistung ${v}` }))}
        y={y}
        barWidth={half}
        tone="ink"
      />
      <BarsAroundZero
        bars={market.map((v, i) => ({ x: cx(i) + half / 2, value: v, title: `Markt ${v}` }))}
        y={y}
        barWidth={half}
        tone="pale"
      />
      <AxisLine x1={padL} x2={width - padR} y={y(0)} />
      <XTicks y={bottom + 18} ticks={months.map((m, i) => ({ x: cx(i), label: m }))} />
    </ChartSvg>
  );
}

function SignedBars({ width }: { width: number }) {
  useAmountPrivacy();
  const padL = 40;
  const padR = 12;
  const top = 12;
  const bottom = 150;
  const x = scaleBand<string>()
    .domain(months.map((_, i) => String(i)))
    .range([padL, width - padR])
    .padding(0.3);
  const y = scaleLinear().domain([-20, 20]).range([bottom, top]);
  const cx = (i: number) => (x(String(i)) ?? 0) + x.bandwidth() / 2;
  return (
    <ChartSvg
      width={width}
      height={bottom + 24}
      label="Veränderung je Monat, Vorzeichen als Balkenrichtung"
      testId="chart-signed"
      points={chartPoints(
        months.map((_, i) => `2026-${String(i + 1).padStart(2, '0')}`),
        (i) => cx(i),
        [
          {
            name: 'Veränderung',
            values: market,
            color: 'var(--heat-green)',
            negativeColor: 'var(--red)',
            format: String,
          },
        ],
      )}
    >
      <AxisLine x1={padL} x2={width - padR} y={y(0)} />
      <BarsAroundZero
        bars={market.map((v, i) => ({ x: cx(i), value: v, title: `Veränderung ${v}` }))}
        y={y}
        barWidth={x.bandwidth()}
        tone="signed"
      />
      <XTicks y={bottom + 18} ticks={months.map((m, i) => ({ x: cx(i), label: m }))} />
    </ChartSvg>
  );
}

function ClassBars({ width }: { width: number }) {
  useAmountPrivacy();
  const prefix = usePatternPrefix('cb');
  const rows = [
    { key: 'need' as const, label: 'Bedarf', value: 50, fill: 'var(--need)' },
    { key: 'want' as const, label: 'Wunsch', value: 30, fill: patternFill(prefix, 'want') },
    { key: 'future' as const, label: 'Zukunft', value: 20, fill: patternFill(prefix, 'future') },
  ];
  const x = scaleLinear()
    .domain([0, 100])
    .range([2, width - 2]);
  let acc = 0;
  return (
    <ChartSvg
      width={width}
      height={70}
      label="50/30/20: Bedarf, Wunsch, Zukunft mit Schraffuren"
      testId="chart-classes"
      points={[
        {
          x: width / 2,
          date: '2026-09',
          series: rows.map((row) => ({
            name: row.label,
            value: `${row.value} %`,
            color: `var(--${row.key})`,
          })),
        },
      ]}
    >
      <ClassPatterns prefix={prefix} />
      {rows.map((row) => {
        const x0 = x(acc);
        acc += row.value;
        const x1 = x(acc);
        return (
          <g key={row.key}>
            <rect x={x0} y={30} width={x1 - x0} height={18} fill={row.fill} />
            <rect x={x0} y={30} width={x1 - x0} height={18} fill="none" stroke="var(--line)" />
            <text x={(x0 + x1) / 2} y={22} textAnchor="middle" className="svg-label-strong">
              {`${row.label} ${row.value} %`}
            </text>
          </g>
        );
      })}
    </ChartSvg>
  );
}

/** Chart primitives showcase (dev page): every mark of the blueprint grammar once. */
export function ChartPrimitivesShowcase() {
  useAmountPrivacy();
  const [aRef, aWidth] = useElementWidth<HTMLDivElement>();
  const [bRef, bWidth] = useElementWidth<HTMLDivElement>();
  const [cRef, cWidth] = useElementWidth<HTMLDivElement>();
  const [dRef, dWidth] = useElementWidth<HTMLDivElement>();
  return (
    <div className="dev-grid">
      <div>
        <h3 className="t-title">Linienarten, Gradnetz, Maßlinie, Höhenkote</h3>
        <div className="chart-frame" ref={aRef}>
          {aWidth > 0 && <LineTypes width={aWidth} />}
        </div>
        <LineLegend
          items={[
            { kind: 'actual', label: 'Ist' },
            { kind: 'plan', label: 'Plan' },
            { kind: 'forecast', label: 'Prognose' },
            { kind: 'previous', label: 'Vormonat oder Vergleichsindex' },
          ]}
        />
      </div>
      <div>
        <h3 className="t-title">Balken um Null und Band</h3>
        <div className="chart-frame" ref={bRef}>
          {bWidth > 0 && <BarsAndBand width={bWidth} />}
        </div>
        <p className="dev-note">
          Eigenleistung in Tusche, Markt in blasser Tusche, Toleranzband getönt.
        </p>
      </div>
      <div>
        <h3 className="t-title">Veränderung mit Vorzeichen</h3>
        <div className="chart-frame" ref={cRef}>
          {cWidth > 0 && <SignedBars width={cWidth} />}
        </div>
        <p className="dev-note">
          Pastellgrün und -rot nur für Veränderungen mit Vorzeichen; die Richtung steht zusätzlich
          in der Lage zur Nulllinie.
        </p>
      </div>
      <div>
        <h3 className="t-title">Klassenfüllungen im segmentierten Balken</h3>
        <div className="chart-frame" ref={dRef}>
          {dWidth > 0 && <ClassBars width={dWidth} />}
        </div>
        <p className="dev-note">Bedarf voll, Wunsch 135°-Schraffur, Zukunft Kreuzschraffur.</p>
      </div>
    </div>
  );
}
