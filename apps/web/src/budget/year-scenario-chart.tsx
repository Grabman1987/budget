import {
  lastDayOfMonth,
  type plannedEventOccurrences,
  type planYearScenario,
} from '@budget/domain';
import {
  AxisLine,
  ChartSvg,
  Graticule,
  LineLegend,
  StepLine,
  TodayLine,
  XTicks,
  maskMoneyText,
  useAmountPrivacy,
  type ChartTooltipPoint,
  type Point,
} from '@budget/ui';
import { scaleLinear } from 'd3-scale';
import { useElementWidth } from '../charts/use-element-width';
import { eur, longDay } from '../ledger/format';
import { kfmt, yTicks } from '../wealth/networth-model';

type Scenario = ReturnType<typeof planYearScenario>;
type Occurrence = ReturnType<typeof plannedEventOccurrences>[number];
const stamp = (date: string) => Date.parse(`${date}T00:00:00Z`);

/** Draw existing monthly amounts; dated event markers never invent a daily free-money balance. */
export function YearScenarioChart({
  year,
  scenario,
  without,
  asOf,
  occurrences,
}: {
  year: number;
  scenario: Scenario;
  without: boolean;
  asOf: string;
  occurrences: readonly Occurrence[];
}) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const start = `${year}-01-01`;
  const end = `${year}-12-31`;
  const months = scenario.months.map((row) => ({
    ...row,
    date: lastDayOfMonth(row.month),
    value: without ? row.withoutCents : row.withCents,
  }));
  const actual = months
    .filter((row) => row.date <= asOf)
    .map((row) => ({
      date: row.date,
      value: row.withoutCents,
    }));
  const current = months.find((row) => row.month === asOf.slice(0, 7) && row.date > asOf);
  if (current) actual.push({ date: asOf, value: current.withoutCents });
  const future = months.filter((row) => row.date > asOf);
  const values = [...actual, ...future.map(({ date, value }) => ({ date, value }))];
  const low = values.reduce((a, b) => (b.value < a.value ? b : a));
  const height = width < 600 ? 176 : 244;
  const top = width < 600 ? 30 : 38;
  const bottom = height - 30;
  const left = 54;
  const right = Math.max(left + 1, width - 18);
  const x = scaleLinear()
    .domain([stamp(start), stamp(end)])
    .range([left, right]);
  const markerDates = [...new Set(occurrences.map((event) => event.date))].sort();
  let lastLabelX = -Infinity;
  const labelledDates = new Set<string>();
  for (const date of markerDates) {
    const position = x(stamp(date));
    if (position - lastLabelX < 48) continue;
    labelledDates.add(date);
    lastLabelX = position;
  }
  const bounds = [
    Math.min(0, ...values.map((row) => row.value)),
    Math.max(1, ...values.map((row) => row.value)),
  ];
  const y = scaleLinear().domain(bounds).nice(4).range([bottom, top]);
  const ticks = yTicks(y.domain()[0]!, y.domain()[1]!);
  const drawPoints = (rows: readonly { date: string; value: number }[]): Point[] =>
    rows.map((row) => [x(stamp(row.date)), y(row.value)]);
  const projected = future.length ? [...actual.slice(-1), ...future] : [];
  const points: Array<ChartTooltipPoint & { order: number }> = [
    ...months.map((row) => ({
      date: row.date,
      x: x(stamp(row.date)),
      order: 0,
      series: [
        {
          name: `Zu verteilen ${without ? 'ohne' : 'mit'} Ereignissen · Monatsende`,
          value: eur(row.value),
        },
        { name: 'Gespeicherter Monatsplan ohne Ereignisse', value: eur(row.withoutCents) },
        {
          name: 'Ereignisse bis dahin zusammen',
          value: eur(without ? 0 : row.effectCents, { sign: true }),
        },
      ],
    })),
    ...occurrences.map((event) => ({
      date: event.date,
      x: x(stamp(event.date)),
      order: 1,
      series: [{ name: maskMoneyText(event.name), value: eur(event.amountCents, { sign: true }) }],
    })),
  ];
  if (current)
    points.push({
      date: asOf,
      x: x(stamp(asOf)),
      order: 0,
      series: [
        {
          name: 'Gespeicherter Stand bis heute · ohne künftige Ereignisse',
          value: eur(current.withoutCents),
        },
      ],
    });
  points.sort((a, b) => a.date.localeCompare(b.date) || a.order - b.order);
  // Equal-date series share one hit point, so pointer/touch can inspect every event too.
  const byDate = new Map<string, ChartTooltipPoint>();
  for (const point of points) {
    const known = byDate.get(point.date);
    byDate.set(point.date, {
      date: point.date,
      x: point.x,
      series: [...(known?.series ?? []), ...point.series],
    });
  }
  const inspectionPoints = [...byDate.values()];
  const summary = `Freies Geld im Jahr ${year}: Dezember ${eur(months[11]!.value)}, Tiefpunkt ${eur(low.value)} am ${longDay(low.date)}. Gespeicherte Monatsstände und geplante Ereignisse, keine tägliche Kontostandsprognose.`;
  return (
    <div className="year-scenario-chart">
      <div ref={ref}>
        {width > 0 && (
          <ChartSvg
            width={width}
            height={height}
            label={summary}
            testId="year-scenario-chart"
            points={inspectionPoints}
            table
            tooltipNote="Die Stufen zeigen Monatsstände. Ereignismarker zeigen echte Termine; zwischen Monatsständen wird kein Tagesguthaben berechnet."
          >
            <Graticule
              x1={left}
              x2={right}
              lines={ticks.map((value) => ({ y: y(value), label: kfmt(value / 100) }))}
            />
            <AxisLine x1={left} x2={right} y={y(0)} />
            {asOf >= start && asOf <= end && <TodayLine x={x(stamp(asOf))} y1={top} y2={bottom} />}
            <StepLine points={drawPoints(actual)} kind="actual" draw={false} />
            <StepLine points={drawPoints(projected)} kind="plan" draw={false} />
            {values.map((row) => (
              <circle
                key={row.date}
                cx={x(stamp(row.date))}
                cy={y(row.value)}
                r={3}
                fill={row.date > asOf ? 'var(--surface)' : 'var(--ink)'}
                stroke="var(--ink)"
              />
            ))}
            {markerDates.map((date) => (
              <g key={date}>
                <line
                  x1={x(stamp(date))}
                  x2={x(stamp(date))}
                  y1={top}
                  y2={bottom}
                  className="axis axis-dashed"
                />
                {labelledDates.has(date) && (
                  <text
                    x={x(stamp(date))}
                    y={20}
                    textAnchor={x(stamp(date)) > right - 28 ? 'end' : 'middle'}
                    className="svg-label"
                  >
                    ◇ {longDay(date).slice(0, 5)}
                  </text>
                )}
              </g>
            ))}
            <circle
              cx={x(stamp(low.date))}
              cy={y(low.value)}
              r={5}
              fill="var(--surface)"
              stroke="var(--line)"
              strokeWidth={2}
            />
            <XTicks
              y={height - 8}
              ticks={months
                .filter((_, i) => width >= 600 || i % 3 === 0 || i === 11)
                .map((row) => ({
                  x: x(stamp(row.date)),
                  label: new Intl.DateTimeFormat('de-AT', {
                    month: 'short',
                    timeZone: 'UTC',
                  }).format(new Date(stamp(row.date))),
                }))}
            />
          </ChartSvg>
        )}
      </div>
      <LineLegend
        items={[
          { kind: 'actual', label: 'Gespeicherter Stand bis heute' },
          {
            kind: 'plan',
            label: without ? 'Plan ohne Ereignisse' : 'Plan mit ausgewählten Ereignissen',
          },
        ]}
      />
      <p className="year-chart-low">
        Tiefpunkt der dargestellten Stände: <strong>{eur(low.value)}</strong> am {longDay(low.date)}
        .
      </p>
    </div>
  );
}
