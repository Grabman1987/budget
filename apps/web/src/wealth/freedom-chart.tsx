import { useState } from 'react';
import { chartPoints } from '../charts/tooltip-data';
import {
  useAmountPrivacy,
  ChartSvg,
  Graticule,
  Line,
  ElevationMark,
  Switch,
  linePath,
  TodayLine,
  type Point,
} from '@budget/ui';
import { addMonths, MAX_FREEDOM_MONTHS, type FreedomProjection } from '@budget/domain';
import type { FreedomInvestedHistory } from '@budget/db';
import { useElementWidth } from '../charts/use-element-width';
import { eur, longDay } from '../ledger/format';
import { kfmt, yTicks } from './networth-model';
import { monthText } from './freedom-model';
import { freedomHistoryModel } from './freedom-history-model';

/** Exact month-end actuals and the unchanged shared forecast, including its final partial year. */
export function FreedomChart({
  projection: p,
  target,
  startMonth,
  history,
}: {
  projection: FreedomProjection | null;
  target: number | null;
  startMonth: string;
  history?: FreedomInvestedHistory | undefined;
}) {
  useAmountPrivacy();
  const [asTable, setAsTable] = useState(false);
  const showTable = asTable && p !== null;
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const H = 260,
    L = 56,
    R = 20,
    T = 28,
    B = H - 28;
  const months = p?.months ?? MAX_FREEDOM_MONTHS;
  const values = p?.yearlyPath ?? [];
  const model = freedomHistoryModel(history, p, startMonth);
  const x = (date: string) => L + model.position(date) * (width - L - R);
  const actualValues = model.actual.flatMap((point) =>
    point.investedCents === null ? [] : [point.investedCents],
  );
  const low = Math.min(0, ...values, ...actualValues);
  const high = Math.max(target ?? 0, ...values, ...actualValues, 1);
  const span = (high - low) * 1.12;
  const y = (v: number) => B - ((v - low) / span) * (B - T);
  const points: Point[] = model.forecast.map((point) => [x(point.date), y(point.investedCents)]);
  const first = points[0];
  const actualByDate = new Map(model.actual.map((point) => [point.date, point.investedCents]));
  const forecastByDate = new Map(model.forecast.map((point) => [point.date, point.investedCents]));
  const label = `${history ? 'Investiertes Vermögen: Ist seit Oktober 2023. Fehlende Bewertungen bleiben Lücken. ' : ''}${p ? `Prognose ab ${monthText(startMonth)}: ${p.doneMonth ? `Ziel erreicht ${monthText(p.doneMonth)}` : 'Ziel innerhalb von 60 Jahren nicht erreicht'}. Keine Garantie.` : 'Prognose derzeit nicht verfügbar.'}`;
  return (
    <div ref={ref} className="freedom-chart">
      {p && (
        <div className="freedom-table-switch">
          <label id="freedom-table-label" htmlFor="freedom-table-switch">
            Prognosewerte als Tabelle
          </label>
          <Switch
            id="freedom-table-switch"
            labelledBy="freedom-table-label"
            checked={asTable}
            onChange={setAsTable}
          />
        </div>
      )}
      {!showTable && width > 0 && (
        <ChartSvg
          width={width}
          height={H}
          testId="freedom-chart"
          points={chartPoints(model.dates, (i) => x(model.dates[i]!), [
            ...(history
              ? [
                  {
                    name: 'Ist',
                    values: model.dates.map((date) => actualByDate.get(date)),
                    color: 'var(--line)',
                  },
                ]
              : []),
            ...(p
              ? [
                  {
                    name: 'Prognose',
                    values: model.dates.map((date) => forecastByDate.get(date)),
                    color: 'var(--line)',
                  },
                ]
              : []),
            ...(target !== null
              ? [{ name: 'Ziel', values: model.dates.map(() => target), color: 'var(--line-2)' }]
              : []),
          ]).map((point) => ({
            ...point,
            series: point.series.filter(
              (series) =>
                series.name === 'Ziel' ||
                (series.name === 'Ist'
                  ? actualByDate.has(point.date)
                  : forecastByDate.has(point.date)),
            ),
          }))}
          label={label}
        >
          <Graticule
            x1={L}
            x2={width - R}
            lines={yTicks(low / 100, (low + span) / 100).map((v) => ({
              y: y(v * 100),
              label: kfmt(v),
            }))}
          />
          {target !== null && <path className="l-goal" d={`M${L} ${y(target)}H${width - R}`} />}
          {history && <TodayLine x={x(history.current.date)} y1={T} y2={B} />}
          {model.segments.map((segment) => (
            <path
              key={segment[0]!.date}
              data-testid="freedom-actual-segment"
              className="l-actual"
              d={linePath(segment.map((point) => [x(point.date), y(point.investedCents!)]))}
            />
          ))}
          {model.actual
            .filter((point) => point.investedCents !== null)
            .map((point) => (
              <circle
                key={point.date}
                cx={x(point.date)}
                cy={y(point.investedCents!)}
                r={3}
                className="dot-actual"
              />
            ))}
          {p && <Line kind="forecast" points={points} />}
          {first && <circle cx={first[0]} cy={first[1]} r={4} className="dot-actual" />}
          {p && p.months !== null && target !== null && (
            <ElevationMark
              x={x(model.forecast.at(-1)!.date)}
              y={y(target)}
              label={`Ziel ${p.doneYear}`}
              align={months === 0 ? 'start' : 'end'}
              shelf={18}
            />
          )}
          <text x={L} y={H - 6} className="svg-label-line">
            {history ? monthText(model.dates[0]!.slice(0, 7)) : 'heute'}
          </text>
          <text x={width - R} y={H - 6} textAnchor="end" className="svg-label">
            {model.dates.at(-1)?.slice(0, 4)}
          </text>
        </ChartSvg>
      )}
      {!showTable && (
        <div className="legend" aria-hidden="true">
          {history && (
            <span>
              <svg viewBox="0 0 26 8">
                <path className="l-actual" d="M0 4h26" />
              </svg>
              Ist investiertes Vermögen
            </span>
          )}
          {p && (
            <span>
              <svg viewBox="0 0 26 8">
                <path className="l-forecast" d="M0 4h26" />
              </svg>
              Prognose ab heute
            </span>
          )}
          {target !== null && (
            <span>
              <svg viewBox="0 0 26 8">
                <path className="l-goal" d="M0 4h26" />
              </svg>
              Ziel {eur(target)}
            </span>
          )}
        </div>
      )}
      {showTable && p && (
        <table className="kv-table" data-testid="freedom-table">
          <caption>Ungespeicherte Prognose · keine Garantie</caption>
          <thead>
            <tr>
              <th>Monat</th>
              <th>Investiert</th>
            </tr>
          </thead>
          <tbody>
            {values.map((v, i) => (
              <tr key={i}>
                <td>{monthText(addMonths(startMonth, Math.min(i * 12, months)))}</td>
                <td>{eur(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {history && (
        <p className="vnote">
          Ist: abgeschlossene Monatsenden · Heute {longDay(history.current.date)} separat.
        </p>
      )}
      {history && (
        <details className="freedom-data">
          <summary>Ist-Werte als Tabelle · fehlende Bewertungen bleiben Lücken</summary>
          <table className="kv-table" data-testid="freedom-history-table">
            <caption>Monatsenden seit Oktober 2023 · Kontenauswahl Stand heute</caption>
            <thead>
              <tr>
                <th>Datum</th>
                <th>Investiert</th>
              </tr>
            </thead>
            <tbody>
              {model.actual.map((point) => (
                <tr key={point.date}>
                  <td>
                    {longDay(point.date)}
                    {point.date === history.current.date ? ' · Heute' : ''}
                  </td>
                  <td>
                    {point.investedCents === null ? 'nicht bewertbar' : eur(point.investedCents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
