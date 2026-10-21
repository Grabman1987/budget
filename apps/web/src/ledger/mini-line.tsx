import { ChartSvg, maskMoneyText, type ChartTooltipPoint } from '@budget/ui';
import { chartPoints } from '../charts/tooltip-data';
import { nativeCurrency } from './format';
import { Line, StepLine, type Point } from '@budget/ui';
import type { AccountSeriesDayQuality, SeriesPoint } from './types';

const WIDTH = 120;
const HEIGHT = 30;

/** 90-day line of an account in the overview: the start value as pale reference, end dot. */
export function MiniLine({
  requireQuality = false,
  days = 90,
  quality,
  label,
  table = false,
  ...legacy
}: {
  points: ReadonlyArray<SeriesPoint>;
  currency?: string;
  days?: number;
  requireQuality?: boolean;
  quality?: Readonly<Record<string, AccountSeriesDayQuality>> | undefined;
  label?: string;
  table?: boolean;
}) {
  return requireQuality ? (
    <QualifiedMiniLine {...legacy} days={days} quality={quality} label={label} table={table} />
  ) : (
    <LegacyMiniLine {...legacy} />
  );
}

/** Retain the existing no-options caller, including its original 90-day label and baseline. */
function LegacyMiniLine({
  points,
  currency = 'EUR',
}: {
  points: ReadonlyArray<SeriesPoint>;
  currency?: string;
}) {
  if (points.length < 2) return <span className="kmini" aria-hidden="true" />;
  const values = points.map((p) => p.balanceCents);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const y = (v: number) => HEIGHT - 3 - ((v - lo) / span) * (HEIGHT - 6);
  const line: Point[] = points.map((p, i) => [
    (i / (points.length - 1)) * (WIDTH - 4),
    y(p.balanceCents),
  ]);
  const last = line[line.length - 1] as Point;
  const start = y(values[0] as number);
  return (
    <ChartSvg
      width={WIDTH}
      height={HEIGHT}
      className="kmini"
      label="Kontosaldo der letzten 90 Tage"
      points={chartPoints(
        points.map((p) => p.date),
        (i) => line[i]![0],
        [
          { name: 'Saldo', values, format: (v) => nativeCurrency(v, currency) },
          {
            name: 'Anfangswert',
            values: values.map(() => values[0]!),
            color: 'var(--line-2)',
            format: (v) => nativeCurrency(v, currency),
          },
        ],
      )}
    >
      <Line
        kind="plan"
        points={[
          [0, start],
          [WIDTH - 4, start],
        ]}
      />
      <StepLine kind="actual" points={line} />
      <circle cx={last[0]} cy={last[1]} r={2.5} className="dot-actual" />
    </ChartSvg>
  );
}

function QualifiedMiniLine({
  points,
  currency = 'EUR',
  days,
  quality,
  label,
  table,
}: {
  points: ReadonlyArray<SeriesPoint>;
  currency?: string;
  days: number;
  quality: Readonly<Record<string, AccountSeriesDayQuality>> | undefined;
  label: string | undefined;
  table: boolean;
}) {
  if (!points.length) return <span className="overview-line-empty">Verlauf nicht verfügbar</span>;
  const values = points.map((point) => {
    const fact = quality?.[point.date];
    return fact?.known === true &&
      fact.currency === currency &&
      fact.missing === null &&
      ['exact', 'stale', 'estimated'].includes(fact.quality) &&
      Number.isSafeInteger(point.balanceCents)
      ? point.balanceCents
      : null;
  });
  const known = values.filter((value): value is number => value !== null);
  const lo = known.length ? Math.min(...known) : 0;
  const hi = known.length ? Math.max(...known) : 1;
  const span = hi - lo || 1;
  const x = (index: number) =>
    points.length === 1 ? 0 : (index / (points.length - 1)) * (WIDTH - 4);
  const y = (value: number) => HEIGHT - 3 - ((value - lo) / span) * (HEIGHT - 6);
  const segments: Point[][] = [];
  let segment: Point[] = [];
  values.forEach((value, index) => {
    if (value === null) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push([x(index), y(value)]);
  });
  if (segment.length) segments.push(segment);
  const tooltip: ChartTooltipPoint[] = points.map((point, index) => {
    const fact = quality?.[point.date];
    const value = values[index];
    const basis =
      fact?.source === 'account_value_eur'
        ? 'Kontowert inkl. Depot-Cash'
        : fact?.source === 'native_cash'
          ? 'Buchungssaldo'
          : 'Kontoverlauf';
    const state = !fact
      ? 'Qualität nicht verfügbar'
      : !fact.known || value === null
        ? fact.missing === 'price'
          ? 'Wertpapierkurs/Einstand fehlt'
          : fact.missing === 'fx'
            ? 'Wechselkurs fehlt'
            : 'Nicht verfügbar'
        : fact.quality === 'estimated'
          ? 'Einstandsschätzung'
          : fact.quality === 'stale'
            ? 'Älterer Kurs'
            : 'Bekannter Wert';
    return {
      date: point.date,
      x: x(index),
      series: [
        {
          name: `${basis} (${currency})`,
          value: value == null ? '–' : nativeCurrency(value, currency),
        },
        { name: 'Datengrundlage', value: state },
      ],
    };
  });
  const lastValue = values.at(-1);
  return (
    <ChartSvg
      width={WIDTH}
      height={HEIGHT}
      className="kmini"
      label={maskMoneyText(`${label ? `${label} · ` : ''}Kontoverlauf der letzten ${days} Tage`)}
      points={tooltip}
      table={table}
    >
      {segments.map((line, index) =>
        line.length === 1 ? (
          <circle key={index} cx={line[0]![0]} cy={line[0]![1]} r={2.5} className="dot-actual" />
        ) : (
          <StepLine key={index} kind="actual" points={line} draw={false} />
        ),
      )}
      {lastValue != null && (
        <circle cx={x(values.length - 1)} cy={y(lastValue)} r={2.5} className="dot-actual" />
      )}
      {!known.length && (
        <text x={0} y={HEIGHT / 2} className="overview-line-label">
          Nicht verfügbar
        </text>
      )}
    </ChartSvg>
  );
}
