import { ChartSvg, Line, LineLegend, Segmented, useAmountPrivacy } from '@budget/ui';
import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { portfolioPerformanceQuery } from './portfolio-api';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { eur, longDay } from '../ledger/format';
import { ppText } from '../pages/portfolio-report-shared';
import { ZeitraumSwitch } from './frame';
import { useZeitraum } from './zeitraum';
import { kfmt, monthTickLabel, monthTicks, portfolioIndexAxis } from './networth-model';
import { AppLink } from '../shell/app-link';
import { useElementWidth } from '../charts/use-element-width';
import {
  HistoricalBasisCue,
  historicalBasisReasons,
  PortfolioCalculationDisclosure,
} from '../reports/portfolio-calculation-disclosure-512';

const percent = (rate: number) =>
  `${rate < 0 ? '−' : '+'}${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(Math.abs(rate) * 100)} %`;

/** Read the same time-weighted history as Reports; only chart geometry lives here. */
export function PortfolioOverview() {
  useAmountPrivacy();
  const [mode, setMode] = useState<'value' | 'return'>('value');
  const [period] = useZeitraum();
  const [chartFrameRef, chartFrameWidth] = useElementWidth<HTMLElement>();
  const query = useQuery(portfolioPerformanceQuery(period));
  const performance = query.data?.portfolio.performance;
  const basisId = useId();
  const sourceId = useId();
  const basisReasons = query.data ? historicalBasisReasons(query.data.portfolio) : [];
  const index = query.data?.portfolio.performanceHistory?.dailyIndex ?? [];
  const values = query.data?.portfolio.performanceHistory?.dailyValues ?? [];
  const benchmarks = query.data?.portfolio.benchmarks ?? [];
  const valueMode = mode === 'value';
  const colors = ['var(--line)', 'var(--future)', 'var(--want)', 'var(--ink-3)', 'var(--ink-2)'];
  const lines = [
    {
      name: valueMode ? 'Wertpapiere' : 'Entwicklung (Indexbasis 100)',
      points: valueMode
        ? values.map((p) => ({ date: p.date, value: p.valueCents }))
        : index.map((p) => ({ date: p.date, value: p.portfolio })),
    },
    ...(!valueMode
      ? benchmarks.map((b) => ({
          name: b.name,
          points: b.dailyBenchmark.map((p) => ({ date: p.date, value: p.benchmark })),
        }))
      : []),
  ];
  const levels = lines.flatMap((line) =>
    line.points.flatMap((p) => (p.value === null ? [] : [p.value])),
  );
  const hasHistory = levels.length > 0 && lines[0]!.points.length > 1;
  const axis = portfolioIndexAxis(valueMode ? [0, ...levels] : levels);
  if (valueMode && levels.every((v) => v >= 0)) axis.min = 0;
  const rows = lines[0]!.points;
  const renderedWidth = chartFrameWidth || 340;
  const width = renderedWidth,
    height = 210,
    left = 58,
    right = 16,
    top = 20,
    bottom = 30;
  const firstDay = Date.parse(`${rows[0]?.date ?? '1970-01-01'}T00:00:00Z`);
  const lastDay = Date.parse(`${rows.at(-1)?.date ?? '1970-01-01'}T00:00:00Z`);
  const x = (date: string) =>
    left +
    ((Date.parse(`${date}T00:00:00Z`) - firstDay) / Math.max(1, lastDay - firstDay)) *
      (width - left - right);
  const y = (value: number) =>
    top + ((axis.max - value) / (axis.max - axis.min)) * (height - top - bottom);
  const crossesCalendarYear = index[0]?.date.slice(0, 4) !== index.at(-1)?.date.slice(0, 4);
  const svgTickGap = crossesCalendarYear ? 72 : 58;
  const dateTicks = monthTicks(
    index.map((point) => point.date),
    renderedWidth,
  ).filter((tick) => {
    if (tick.index <= 0 || tick.index >= index.length - 1) return false;
    const tickX = x(tick.day);
    return tickX >= left + svgTickGap && tickX <= width - right - svgTickGap;
  });
  const segmentedLines = lines.map((line) => {
    const segments: { date: string; value: number }[][] = [[]];
    for (const point of line.points) {
      if (point.value === null) segments.push([]);
      else segments.at(-1)!.push({ date: point.date, value: point.value });
    }
    return segments.filter((segment) => segment.length > 0);
  });
  const valuesByDate = new Map(values.map((p) => [p.date, p]));
  const lineValues = lines.map((line) => new Map(line.points.map((p) => [p.date, p.value])));
  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat('de-AT', {
      day: '2-digit',
      month: '2-digit',
      ...(crossesCalendarYear ? { year: '2-digit' as const } : {}),
      timeZone: 'UTC',
    }).format(new Date(`${date}T12:00:00Z`));
  return (
    <section ref={chartFrameRef} className="portfolio-overview" aria-label="Portfolioentwicklung">
      <div className="head">
        <h2>Verlauf</h2>
        <Segmented
          label="Darstellung"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'value', label: 'Wert €' },
            { value: 'return', label: 'Rendite %' },
          ]}
        />
        <ZeitraumSwitch />
      </div>
      <p className="vnote">
        Wertpapiere ohne Depot-Bargeld ·{' '}
        {performance ? longDay(performance.to) : 'noch keine Bewertung'}
      </p>
      {query.isPending && <LoadingNote what="Portfolioentwicklung" />}
      {query.isError && (
        <ErrorNote
          what="Portfolioentwicklung"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {performance && (
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', columnGap: 12 }}>
          <details className="wealth-details" style={{ flex: '0 1 auto', minWidth: 0 }}>
            <summary
              data-testid="portfolio-return"
              aria-describedby={basisReasons.length ? basisId : undefined}
            >
              Rendite p. a.{' '}
              {performance.ttwrorAnnualised !== null &&
              Number.isFinite(performance.ttwrorAnnualised) &&
              performance.days > 0
                ? percent(performance.ttwrorAnnualised)
                : '—'}{' '}
              (zeitgewichtet) <Info size={20} strokeWidth={1.5} aria-hidden="true" />
            </summary>
            <p className="vnote">
              Zeitgewichtete Rendite nach Portfolio Performance, auf ein Jahr umgerechnet. Zuflüsse
              zählen am Tagesanfang, Abflüsse am Tagesende. Wertpapiere ohne Depotkassa: nach
              Gebühren, vor Steuern. {longDay(performance.from)} bis {longDay(performance.to)}.
              Kurze Zeiträume können stark schwanken. Die Renditen werden auf Basis 100 verkettet.
              Ohne Kapital einschließlich Tageszuflüssen bleibt der betreffende Tag als Lücke
              sichtbar; die Linie zeigt dieselbe zeitgewichtete Entwicklung wie die Reports.
            </p>
            {query.data && (
              <PortfolioCalculationDisclosure
                summary={query.data.portfolio}
                incomplete={query.data.incomplete}
                sourceId={sourceId}
              />
            )}
          </details>
          <HistoricalBasisCue reasons={basisReasons} id={basisId} sourceId={sourceId} />
        </div>
      )}
      {hasHistory ? (
        <div className="portfolio-chart-frame">
          <ChartSvg
            width={width}
            height={height}
            label={
              valueMode
                ? 'Portfolioentwicklung, Wert in Euro'
                : 'Portfolioentwicklung, zeitgewichtet, Indexbasis 100'
            }
            testId="portfolio-overview-chart"
            tooltipNote="Tägliche Bewertungswerte; gespeicherte Kurse können bis zum nächsten gespeicherten Kurs fortgeschrieben sein."
            points={rows.map((p) => ({
              x: x(p.date),
              date: p.date,
              series: [
                ...lines.map((line, i) => {
                  const value = lineValues[i]!.get(p.date);
                  return {
                    name: line.name,
                    color: colors[i]!,
                    value:
                      value == null
                        ? 'Nicht verfügbar · Kurs-/Renditelücke'
                        : valueMode
                          ? eur(value)
                          : `${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(value)} (${percent(value / 100 - 1)})`,
                  };
                }),
                ...(valueMode
                  ? [
                      {
                        name: 'Einzahlungen',
                        value: eur(valuesByDate.get(p.date)?.depositsCents ?? 0),
                      },
                      {
                        name: 'Auszahlungen',
                        value: eur(valuesByDate.get(p.date)?.withdrawalsCents ?? 0),
                      },
                    ]
                  : []),
              ],
            }))}
          >
            {axis.ticks
              .filter((tick) => !valueMode || tick >= axis.min)
              .map((tick) => (
                <g key={tick}>
                  <line
                    x1={left}
                    x2={width - right}
                    y1={y(tick)}
                    y2={y(tick)}
                    className="graticule"
                  />
                  <text x={left - 8} y={y(tick) + 4} textAnchor="end" className="svg-label">
                    {valueMode
                      ? `${kfmt(tick === 0 ? 0 : tick / 100)} €`
                      : `${new Intl.NumberFormat('de-AT', {
                          maximumFractionDigits: axis.fractionDigits,
                        }).format(tick - 100)} %`}
                  </text>
                </g>
              ))}
            <line
              x1={left}
              x2={width - right}
              y1={height - bottom}
              y2={height - bottom}
              className="axis"
            />
            {segmentedLines.map((segments, li) => (
              <g key={li} className={`portfolio-chart-line portfolio-chart-line-${li}`}>
                {segments.map((points, i) =>
                  points.length > 1 ? (
                    <Line
                      key={i}
                      kind={li === 0 ? 'actual' : 'benchmark'}
                      draw={false}
                      points={points.map((point) => [x(point.date), y(point.value)])}
                    />
                  ) : (
                    <circle
                      key={i}
                      cx={x(points[0]!.date)}
                      cy={y(points[0]!.value)}
                      r={3}
                      fill={colors[li]}
                    />
                  ),
                )}
              </g>
            ))}
            {valueMode &&
              values
                .filter((p) => p.depositsCents > 0 || p.withdrawalsCents > 0)
                .map((p) => (
                  <g key={p.date} data-testid="portfolio-flow-marker">
                    {p.depositsCents > 0 && (
                      <circle
                        cx={x(p.date)}
                        cy={y(p.valueCents)}
                        r={4}
                        className="portfolio-deposit-marker"
                      />
                    )}
                    {p.withdrawalsCents > 0 && (
                      <rect
                        x={x(p.date) - 4}
                        y={y(p.valueCents) - 4}
                        width={8}
                        height={8}
                        className="portfolio-withdrawal-marker"
                      />
                    )}
                  </g>
                ))}
            {dateTicks.map(({ day }) => (
              <g key={day}>
                <line
                  x1={x(day)}
                  x2={x(day)}
                  y1={height - bottom}
                  y2={height - bottom + 4}
                  className="axis"
                />
                <text x={x(day)} y={height - 4} textAnchor="middle" className="svg-label">
                  {monthTickLabel(day)}
                </text>
              </g>
            ))}
            <text x={left} y={height - 4} textAnchor="start" className="svg-label">
              {dateLabel(rows[0]!.date)}
            </text>
            <text x={width - right} y={height - 4} textAnchor="end" className="svg-label">
              {dateLabel(rows.at(-1)!.date)}
            </text>
          </ChartSvg>
        </div>
      ) : query.isSuccess && index.length > 1 ? (
        <p className="vnote">Keine zusammenhängende Renditehistorie für diesen Zeitraum.</p>
      ) : (
        query.isSuccess && (
          <p className="vnote">Noch keine vollständige Renditehistorie für diesen Zeitraum.</p>
        )
      )}
      {hasHistory && (
        <div className="portfolio-chart-legends">
          {lines.map((line, i) => (
            <div key={line.name} className={`portfolio-chart-line portfolio-chart-line-${i}`}>
              <LineLegend items={[{ kind: i === 0 ? 'actual' : 'benchmark', label: line.name }]} />
              {i > 0 && (
                <span>
                  Differenz Portfolio:{' '}
                  {ppText(
                    performance?.ttwror == null || benchmarks[i - 1]!.benchmarkReturn === null
                      ? null
                      : performance.ttwror - benchmarks[i - 1]!.benchmarkReturn!,
                  )}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {valueMode && (
        <p className="vnote">○ Einzahlung · □ Auszahlung · Beträge in der Diagramm-Inspektion.</p>
      )}
      {!valueMode && (
        <p className="vnote">
          Indexbasis 100 am gemeinsamen Start; Achse: Rendite in %. Kursindex, ohne Ausschüttungen.
          Kurslücken unterbrechen die Vergleichslinien.
        </p>
      )}
      {query.isSuccess && benchmarks.length === 0 && (
        <p className="vnote">
          Keine Benchmark gewählt.{' '}
          <AppLink to="/einstellungen/depots" hash="benchmark-settings-title">
            Benchmarks auswählen
          </AppLink>
        </p>
      )}
      {hasHistory && (
        <p className="vnote">
          Tägliche Bewertungswerte; gespeicherte Kurse können bis zum nächsten gespeicherten Kurs
          fortgeschrieben sein.
        </p>
      )}
      <AppLink className="vlook" to="/reports/gruppe/portfolio">
        Reportkatalog Portfolio öffnen
      </AppLink>
    </section>
  );
}
