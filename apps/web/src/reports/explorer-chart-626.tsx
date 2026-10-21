import {
  AxisLine,
  Button,
  ChartSvg,
  Graticule,
  Line,
  ReportTrendContext,
  XTicks,
  useAmountPrivacy,
} from '@budget/ui';
import { useState } from 'react';
import { useElementWidth } from '../charts/use-element-width';
import { kfmt } from '../wealth/networth-model';
import {
  boundedChartRows,
  type ExplorerChartModel,
  type ExplorerChartUnit,
} from './explorer-chart-model-626';
import { explorerChartValue626 } from './explorer-table-inspector-626';

export function ExplorerViewToggle626({
  value,
  onChange,
  busy = false,
}: {
  value: 'table' | 'chart';
  onChange: (value: 'table' | 'chart') => void;
  busy?: boolean;
}) {
  return (
    <div className="ex-view-toggle" role="group" aria-label="Darstellung">
      <Button variant="ghost" aria-pressed={value === 'table'} onClick={() => onChange('table')}>
        Tabelle
      </Button>
      <Button
        variant="ghost"
        aria-pressed={value === 'chart'}
        disabled={busy}
        onClick={() => onChange('chart')}
      >
        Diagramm
      </Button>
    </div>
  );
}

// Distinct labelled marker shapes retain row identity without treating dashes as forecasts.
function marker(index: number, x: number, y: number) {
  const shapes = [
    `M${x - 3},${y}a3,3 0 1,0 6,0a3,3 0 1,0 -6,0`,
    `M${x - 3},${y - 3}h6v6h-6Z`,
    `M${x},${y - 4}l4,7h-8Z`,
    `M${x},${y - 4}l4,4l-4,4l-4,-4Z`,
    `M${x - 3},${y - 3}l6,6M${x + 3},${y - 3}l-6,6`,
    `M${x - 4},${y}h8M${x},${y - 4}v8`,
    `M${x - 4},${y}l2,-3h4l2,3l-2,3h-4Z`,
    `M${x - 4},${y - 3}h8l-4,7Z`,
    `M${x - 4},${y}a4,4 0 1,0 8,0a4,4 0 1,0 -8,0M${x - 1},${y}h2`,
  ];
  return <path d={shapes[index]!} className="ex-series-marker" />;
}
const unitLabel = (unit: ExplorerChartUnit) =>
  unit === 'cents' ? 'Euro' : unit === 'bp' ? 'Prozent' : 'Anzahl';

export function ExplorerChart626({ data }: { data: ExplorerChartModel }) {
  useAmountPrivacy();
  const [selected, setSelected] = useState('');
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const cohort = data.cohorts.find((value) => value.id === selected) ?? data.cohorts[0];
  const series = cohort ? boundedChartRows(cohort.rows, cohort.unit) : [];
  const unit = cohort?.unit ?? 'cents';
  const present = series.flatMap((row) =>
    row.values.filter((value): value is number => value !== null),
  );
  const low = Math.min(0, ...present);
  const high = Math.max(1, ...present);
  const plotWidth = Math.max(1, width - 72);
  const dates = data.columns.map((column) => {
    const month = column.months[0];
    return month && /^\d{4}-\d{2}$/.test(month) ? Date.parse(`${month}-01T00:00:00Z`) : NaN;
  });
  const timed =
    data.temporal && dates.length > 1 && dates.every(Number.isFinite) && dates.at(-1)! > dates[0]!;
  const x = (index: number) =>
    60 +
    (timed
      ? (dates[index]! - dates[0]!) / (dates.at(-1)! - dates[0]!)
      : data.columns.length > 1
        ? index / (data.columns.length - 1)
        : 0.5) *
      plotWidth;
  const y = (value: number) => 192 - ((value - low) / (high - low)) * 176;
  const cadence = Math.max(
    1,
    Math.ceil(data.columns.length / Math.max(1, Math.floor(plotWidth / 76))),
  );
  const points = data.columns.map((column, index) => ({
    x: x(index),
    date: column.label,
    series: [
      ...series.map((row) => ({
        name:
          row.key === 'remaining' ? `Weitere · Zeilensumme (${row.sourceRows.length})` : row.label,
        value: explorerChartValue626(row.values[index] ?? null, unit),
      })),
      ...(data.averageReference !== null
        ? [{ name: 'Ø je Monat', value: explorerChartValue626(data.averageReference, unit) }]
        : []),
    ],
  }));
  const remaining = series.find((row) => row.key === 'remaining');
  return (
    <section className="ex-chart-626" aria-label="Diagrammansicht">
      {data.cohorts.length > 1 && (
        <label className="ex-chart-cohort">
          Diagrammzeilen
          <select value={cohort?.id ?? ''} onChange={(event) => setSelected(event.target.value)}>
            {data.cohorts.map((value) => (
              <option key={value.id} value={value.id}>
                {value.label}
              </option>
            ))}
          </select>
        </label>
      )}
      <p className="ov-note">
        {cohort?.label ?? 'Zeilen'} · {unitLabel(unit)} ·{' '}
        {data.temporal ? 'Zeitspalten der Tabelle' : 'Spalte der Tabelle'}.
      </p>
      <div ref={ref} className="ex-chart-drawing">
        {!series.length || !data.columns.length ? (
          <p role="status">Keine Werte für diese Auswahl.</p>
        ) : (
          width > 72 && (
            <ReportTrendContext.Provider value={false}>
              <ChartSvg
                width={width}
                height={228}
                label={`Diagramm · ${cohort?.label ?? 'Zeilen'} · ${unitLabel(unit)}`}
                points={points}
                table
              >
                <Graticule
                  x1={60}
                  x2={width - 12}
                  lines={Array.from({ length: 5 }, (_, index) => {
                    const value = Math.round(low + ((high - low) * index) / 4);
                    return { y: y(value), label: kfmt(unit === 'count' ? value : value / 100) };
                  })}
                />
                <AxisLine x1={60} x2={width - 12} y={y(0)} />
                {series.map((row, rowIndex) => {
                  const segments: Array<Array<[number, number]>> = [];
                  let segment: Array<[number, number]> = [];
                  row.values.forEach((value, index) => {
                    if (value === null) {
                      if (segment.length) segments.push(segment);
                      segment = [];
                    } else segment.push([x(index), y(value)]);
                  });
                  if (segment.length) segments.push(segment);
                  return (
                    <g
                      key={row.key}
                      data-series-key={row.key}
                      className={`ex-chart-series ex-chart-series-${rowIndex}`}
                    >
                      {segments.map((segment, index) => (
                        <Line key={index} points={segment} kind="actual" draw={false} />
                      ))}
                      {row.values.map((value, index) =>
                        value !== null &&
                        (index % cadence === 0 ||
                          index === row.values.length - 1 ||
                          (row.values[index - 1] == null && row.values[index + 1] == null)) ? (
                          <g key={index} data-chart-point={index}>
                            {marker(rowIndex, x(index), y(value))}
                          </g>
                        ) : null,
                      )}
                    </g>
                  );
                })}
                {data.averageReference !== null && (
                  <Line
                    points={[
                      [60, y(data.averageReference)],
                      [width - 12, y(data.averageReference)],
                    ]}
                    kind="benchmark"
                    draw={false}
                  />
                )}
                <XTicks
                  y={216}
                  ticks={data.columns.flatMap((column, index) =>
                    index % cadence === 0 ? [{ x: x(index), label: column.label }] : [],
                  )}
                />
              </ChartSvg>
            </ReportTrendContext.Provider>
          )
        )}
      </div>
      {series.length > 0 && (
        <ul className="ex-chart-legend" aria-label="Reihenlegende">
          {series.map((row, index) => (
            <li key={row.key}>
              <svg width="24" height="16" viewBox="0 0 24 16" aria-hidden="true">
                <path d="M0,8H24" className="ex-series-rule" />
                {marker(index, 12, 8)}
              </svg>
              <span>
                {row.label}
                {row.key === 'remaining' ? ` (${row.sourceRows.length} Zeilen)` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data.averageReference !== null && (
        <p className="ov-note">
          Strichpunktiert: Ø je Monat {explorerChartValue626(data.averageReference, unit)}.
        </p>
      )}
      {present.length === 0 && series.length > 0 && data.columns.length > 0 && (
        <p role="status">Fehlende Werte bleiben Lücken, nicht null Euro.</p>
      )}
      {remaining && (
        <>
          <p className="ov-note">
            Weitere ist die Zeilensumme der übrigen {remaining.sourceRows.length} angezeigten Zeilen
            je Spalte. Fehlende oder nicht darstellbare Summen bleiben offen.{' '}
            {data.measure === 'avg'
              ? 'Durchschnittswerte werden hier nur als angezeigte Zellen addiert, nicht neu gemittelt.'
              : data.measure === 'anzahl'
                ? 'Buchungszahlen können sich bei geteilten Buchungen überschneiden; dies ist keine Gesamtzahl unterschiedlicher Buchungen.'
                : ''}
            {unit === 'bp' ? ' Prozentwerte werden nicht addiert.' : ''}
          </p>
          <details className="ex-chart-originals">
            <summary>Weitere: ursprüngliche Zeilen und eigene Summen</summary>
            <div className="ex-chart-original-scroll">
              <table>
                <caption>Originalwerte der übrigen angezeigten Zeilen</caption>
                <thead>
                  <tr>
                    <th scope="col">Zeile</th>
                    {data.columns.map((column) => (
                      <th key={column.key} scope="col">
                        {column.label}
                      </th>
                    ))}
                    {data.summaryColumns.map((column) => (
                      <th key={column.key} scope="col">
                        {column.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {remaining.sourceRows.map((row) => (
                    <tr key={row.key}>
                      <th scope="row">{row.label}</th>
                      {row.values.map((value, index) => (
                        <td key={data.columns[index]?.key ?? index}>
                          {explorerChartValue626(value, unit)}
                        </td>
                      ))}
                      {data.summaryColumns.map((column) => (
                        <td key={column.key}>{explorerChartValue626(row[column.key], unit)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
      {data.truncated > 0 && (
        <p className="ov-note">
          Das Diagramm umfasst nur die {data.rows.length} angezeigten Zeilen; {data.truncated}{' '}
          weitere Zeilen sind nicht enthalten.
        </p>
      )}
      <p className="ov-note">
        Linien verbinden vorhandene Tabellenwerte; Lücken werden nicht überbrückt. Reihen bleiben
        durch Namen und unterschiedliche Zeichen erkennbar. Die ursprünglichen Summen und Buchungen
        bleiben in der Tabelle verfügbar.
      </p>
    </section>
  );
}
