import { useQuery } from '@tanstack/react-query';
import type { DepotHistoryPoint } from '@budget/db';
import type { Period } from '@budget/domain';
import { ChartSvg, Line, Segmented, privateAmount, useAmountPrivacy, type Point } from '@budget/ui';
import { useState } from 'react';
import { chartPoints } from '../charts/tooltip-data';
import { useElementWidth } from '../charts/use-element-width';
import { performanceDecimal } from '../pages/performance-chart';
import { eur, longDay } from './format';
import { depotHistoryQuery } from './depot-history-api';
import { ErrorNote, LoadingNote } from './states';
import './depot-history.css';

const RANGES: ReadonlyArray<{ value: Period; label: string }> = [
  { value: '3M', label: '3 M' },
  { value: 'YTD', label: 'YTD' },
  { value: '1J', label: '1 J' },
  { value: '3J', label: '3 J' },
  { value: 'Alles', label: 'Alles' },
];
const MODES = [
  { value: 'value', label: 'Wert' },
  { value: 'return', label: 'Rendite' },
] as const;
type Mode = (typeof MODES)[number]['value'];

const percentOfIndex = (index: number) =>
  `${privateAmount(performanceDecimal(index - 100))} %`.replace('-', '−');

/** Depotentwicklung: value (EUR) or time-weighted return (%) over the chosen range. */
export function DepotHistory({ accountId }: { accountId: string }) {
  useAmountPrivacy();
  const [mode, setMode] = useState<Mode>('value');
  const [range, setRange] = useState<Period>('1J');
  const query = useQuery(depotHistoryQuery(accountId, range));
  const rows: ReadonlyArray<DepotHistoryPoint> = query.data?.history ?? [];
  const hasValue = rows.some((row) => row.valueCents !== 0);
  return (
    <section className="depot-history" aria-label="Depotentwicklung" data-testid="depot-history">
      <div className="depot-history-controls">
        <Segmented
          label="Darstellung"
          options={MODES}
          value={mode}
          onChange={setMode}
          className="depot-history-mode"
        />
        <Segmented
          label="Zeitraum"
          options={RANGES}
          value={range}
          onChange={setRange}
          className="depot-history-range"
        />
      </div>
      {query.isPending && <LoadingNote what="Depotentwicklung" />}
      {query.isError && (
        <ErrorNote
          what="Depotentwicklung"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data && !hasValue && (
        <p className="kmeta">Für diesen Zeitraum liegt noch keine Depotentwicklung vor.</p>
      )}
      {query.data && hasValue && <HistoryChart rows={rows} mode={mode} />}
    </section>
  );
}

function HistoryChart({ rows, mode }: { rows: ReadonlyArray<DepotHistoryPoint>; mode: Mode }) {
  useAmountPrivacy();
  const [ref, measured] = useElementWidth<HTMLDivElement>();
  const width = measured || 320;
  const height = 180,
    left = 4,
    right = width - 4,
    top = 8,
    bottom = height - 24;
  const values = rows.map((row) => (mode === 'value' ? row.valueCents : row.index));
  const known = values.filter((value): value is number => value !== null);
  const min = Math.min(...known, mode === 'return' ? 100 : Infinity);
  const max = Math.max(...known, mode === 'return' ? 100 : -Infinity);
  const pad = max === min ? Math.max(1, Math.abs(max) * 0.05) : (max - min) * 0.08;
  const lo = min - pad,
    hi = max + pad;
  const first = Date.parse(rows[0]!.date);
  const span = Math.max(1, Date.parse(rows.at(-1)!.date) - first);
  const x = (date: string) => left + ((Date.parse(date) - first) / span) * (right - left);
  const y = (value: number) => top + ((hi - value) / (hi - lo)) * (bottom - top);
  const segments: Point[][] = [[]];
  values.forEach((value, i) => {
    if (value === null) segments.push([]);
    else segments.at(-1)!.push([x(rows[i]!.date), y(value)]);
  });
  const format = mode === 'value' ? eur : percentOfIndex;
  const label =
    mode === 'value'
      ? `Depotwert von ${longDay(rows[0]!.date)} bis ${longDay(rows.at(-1)!.date)}`
      : `Rendite des Depots von ${longDay(rows[0]!.date)} bis ${longDay(rows.at(-1)!.date)}`;
  return (
    <figure className="depot-history-figure" data-testid="depot-history-chart" data-mode={mode}>
      <div ref={ref}>
        <ChartSvg
          width={width}
          height={height}
          label={label}
          testId="depot-history-svg"
          tooltipNote={
            mode === 'value'
              ? 'Tageswert in EUR laut Bewertung.'
              : 'Zeitgewichtete Rendite seit Beginn des Zeitraums; Ein- und Auszahlungen sind herausgerechnet.'
          }
          points={chartPoints(
            rows.map((row) => row.date),
            (i) => x(rows[i]!.date),
            [{ name: mode === 'value' ? 'Wert' : 'Rendite', values, format }],
          )}
        >
          {mode === 'return' && (
            <line x1={left} x2={right} y1={y(100)} y2={y(100)} className="graticule" />
          )}
          <g className="depot-history-line">
            {segments
              .filter((segment) => segment.length > 0)
              .map((segment, i) =>
                segment.length > 1 ? (
                  <Line key={i} points={segment} kind="actual" draw={false} />
                ) : (
                  <circle
                    key={i}
                    cx={segment[0]![0]}
                    cy={segment[0]![1]}
                    r={3}
                    fill="var(--line)"
                  />
                ),
              )}
          </g>
          <text x={left} y={height - 4} className="svg-label">
            {longDay(rows[0]!.date)}
          </text>
          <text x={right} y={height - 4} textAnchor="end" className="svg-label">
            {longDay(rows.at(-1)!.date)}
          </text>
        </ChartSvg>
      </div>
      <figcaption>
        {mode === 'value' ? 'Wert' : 'Rendite (zeitgewichtet)'}: {format(known.at(-1) ?? 0)}
      </figcaption>
    </figure>
  );
}
