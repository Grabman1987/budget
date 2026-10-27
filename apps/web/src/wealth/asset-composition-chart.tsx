import type { AssetCompositionKey, AssetCompositionPoint } from '@budget/domain';
import { AxisLine, ChartSvg, Graticule, privateAmount, useAmountPrivacy } from '@budget/ui';
import { useElementWidth } from '../charts/use-element-width';
import { eur, longDay } from '../ledger/format';
import { kfmt, monthTickLabel, yTicks } from './networth-model';
import { percentText } from './portfolio-format';

const COLORS: Record<AssetCompositionKey, string> = {
  cash: 'var(--line-2)',
  securities: 'var(--line)',
  depot_cash: 'var(--future)',
  crypto: 'var(--want)',
  other: 'var(--ink-3)',
  debt: 'var(--ink-2)',
  unclassified: 'var(--rule-strong)',
};
const KIND = { month_end: 'Monatsende', period_start: 'Zeitraumstart', as_of: 'Stichtag' };
const HEIGHT = 320;
const LEFT = 56;
const RIGHT = 14;
const TOP = 22;
const BOTTOM = 286;

/** Month-end samples, straight segments and visible gaps. Tooltip/table use the same points. */
export function AssetCompositionChart({ points }: { points: AssetCompositionPoint[] }) {
  useAmountPrivacy();
  const [ref, width] = useElementWidth<HTMLDivElement>();
  return (
    <div className="asset-history">
      <p className="vnote">
        Monatsenden sowie Zeitraumstart und Stichtag. Historische Werte sind nach der heutigen
        Konto- und Wertpapierzuordnung gruppiert.
      </p>
      <div ref={ref} className="vline">
        {width > LEFT + RIGHT && points.length > 0 && <Drawing points={points} width={width} />}
      </div>
      <p className="vnote">
        Flächen über null: Vermögenswerte. Schulden liegen unter null. Die Linie zeigt das
        Nettovermögen, nicht die obere Flächenkante. Fehlende Werte unterbrechen die Darstellung;
        geschätzte oder veraltete Werte bleiben gekennzeichnet.
      </p>
      <ul className="asset-history-legend" aria-label="Vermögensarten im Verlauf">
        {points
          .flatMap((point) => point.groups)
          .filter((group, index, all) => all.findIndex((g) => g.key === group.key) === index)
          .map((group) => (
            <li key={group.key}>
              <i style={{ background: COLORS[group.key] }} aria-hidden="true" />
              {group.label}
            </li>
          ))}
        <li>
          <i className="asset-net-line" aria-hidden="true" />
          Nettovermögen
        </li>
      </ul>
    </div>
  );
}

function Drawing({ points, width }: { points: AssetCompositionPoint[]; width: number }) {
  useAmountPrivacy();
  const keys = [...new Set(points.flatMap((p) => p.groups.map((g) => g.key)))];
  // Only drawing coordinates are accumulated here; financial amounts stay in the producer DTO.
  const stacks = points.map((point) => {
    let positive = 0;
    let negative = 0;
    let positiveKnown = true;
    let negativeKnown = true;
    return keys.map((key) => {
      if (point.unavailable || point.groups.some((g) => g.valueCents === null))
        return { key, lo: null, hi: null };
      const group = point.groups.find((g) => g.key === key);
      const value = group?.valueCents ?? (group ? null : 0);
      if (value === null) {
        // An unpriced position has no known sign; neither stack can bridge it.
        positiveKnown = false;
        negativeKnown = false;
        return { key, lo: null, hi: null };
      }
      if (value < 0) {
        const lo = negative;
        negative += value;
        return { key, lo: negativeKnown ? lo : null, hi: negativeKnown ? negative : null };
      }
      const lo = positive;
      positive += value;
      return { key, lo: positiveKnown ? lo : null, hi: positiveKnown ? positive : null };
    });
  });
  const finite = stacks.flatMap((point) =>
    point.flatMap((s) => (s.lo === null || s.hi === null ? [] : [s.lo, s.hi])),
  );
  const min = Math.min(
    0,
    ...finite,
    ...points.flatMap((p) => (p.totalCents === null ? [] : [p.totalCents])),
  );
  const max = Math.max(
    0,
    ...finite,
    ...points.flatMap((p) => (p.totalCents === null ? [] : [p.totalCents])),
  );
  const padding = (max - min) * 0.08 || 100;
  const low = min - padding;
  const high = max + padding;
  const y = (value: number) => BOTTOM - ((value - low) / (high - low)) * (BOTTOM - TOP);
  const day = (value: string) => Date.parse(`${value}T00:00:00Z`);
  const first = day(points[0]!.asOf);
  const span = day(points[points.length - 1]!.asOf) - first;
  const x = (index: number) =>
    LEFT + (span === 0 ? 0.5 : (day(points[index]!.asOf) - first) / span) * (width - LEFT - RIGHT);
  const inspect = points.map((point, i) => ({
    x: x(i),
    date: point.asOf,
    series: [
      { name: KIND[point.pointKind], value: longDay(point.asOf) },
      {
        name: 'Bewertung',
        value: point.unavailable
          ? 'Gruppierung nicht darstellbar'
          : point.complete
            ? 'Vollständig und aktuell'
            : 'Fehlend, geschätzt oder nicht aktuell',
      },
      ...point.groups.map((group) => ({
        name: group.label,
        color: COLORS[group.key],
        value:
          group.valueCents === null
            ? group.knownCents === null
              ? 'Wert nicht darstellbar'
              : `Wert fehlt · bekannt ${eur(group.knownCents)}`
            : `${eur(group.valueCents)}${group.shareBp === null ? '' : ` · ${privateAmount(percentText(group.shareBp))}`}`,
      })),
      {
        name: 'Nettovermögen',
        color: 'var(--line)',
        value:
          point.totalCents === null
            ? point.knownCents === null
              ? 'Wert nicht darstellbar'
              : `Wert fehlt · bekannt ${eur(point.knownCents)}`
            : eur(point.totalCents),
      },
    ],
  }));
  const tickEvery = Math.max(
    1,
    Math.ceil(points.length / Math.max(2, Math.floor((width - LEFT - RIGHT) / 80))),
  );
  return (
    <ChartSvg
      width={width}
      height={HEIGHT}
      testId="asset-composition-chart"
      label="Zusammensetzung des Nettovermögens an Monatsenden und Ankern; positive Vermögenswerte über null, Schulden darunter und Nettovermögen als Linie"
      points={inspect}
      table
      tooltipNote="Historische Werte, heutige Gruppierung. Keine Zwischenwerte."
    >
      <Graticule
        x1={LEFT}
        x2={width - RIGHT}
        lines={yTicks(low / 100, high / 100).map((v) => ({ y: y(v * 100), label: kfmt(v) }))}
      />
      <AxisLine x1={LEFT} x2={width - RIGHT} y={y(0)} />
      {keys.map((key, groupIndex) => (
        <g key={key} data-composition-key={key} data-zero-y={y(0)}>
          {points.map((point, i) => {
            const now = stacks[i]?.[groupIndex];
            const prev = stacks[i - 1]?.[groupIndex];
            if (!now || now.lo === null || now.hi === null) return null;
            if (i === 0 || !prev || prev.lo === null || prev.hi === null)
              return (
                <line
                  key={point.asOf}
                  x1={x(i)}
                  x2={x(i)}
                  y1={y(now.lo)}
                  y2={y(now.hi)}
                  stroke={COLORS[key]}
                  strokeWidth={3}
                />
              );
            return (
              <path
                key={point.asOf}
                d={`M${x(i - 1)} ${y(prev.lo)}L${x(i - 1)} ${y(prev.hi)}L${x(i)} ${y(now.hi)}L${x(i)} ${y(now.lo)}Z`}
                fill={COLORS[key]}
                fillOpacity={0.5}
                stroke={COLORS[key]}
                strokeWidth={1}
              />
            );
          })}
        </g>
      ))}
      {points.map((point, i) => {
        if (point.totalCents === null || point.unavailable) return null;
        const previous = points[i - 1];
        return (
          <g key={point.asOf}>
            {previous?.totalCents !== null &&
              previous?.totalCents !== undefined &&
              !previous.unavailable && (
                <line
                  x1={x(i - 1)}
                  x2={x(i)}
                  y1={y(previous.totalCents)}
                  y2={y(point.totalCents)}
                  className="l-actual"
                />
              )}
            <circle cx={x(i)} cy={y(point.totalCents)} r={3} className="dot-actual" />
          </g>
        );
      })}
      {points.map(
        (point, i) =>
          (i === 0 ||
            i === points.length - 1 ||
            (i % tickEvery === 0 && x(i) - LEFT >= 64 && x(points.length - 1) - x(i) >= 64)) && (
            <text
              key={point.asOf}
              x={x(i)}
              y={HEIGHT - 6}
              className="svg-label"
              textAnchor={i === 0 ? 'start' : i === points.length - 1 ? 'end' : 'middle'}
            >
              {monthTickLabel(point.asOf)}
              {point.pointKind !== 'month_end' ? ' ·' : ''}
            </text>
          ),
      )}
    </ChartSvg>
  );
}
