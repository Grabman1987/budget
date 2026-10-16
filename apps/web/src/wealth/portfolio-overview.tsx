import { ChartSvg, Line, useAmountPrivacy } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { Info } from 'lucide-react';
import { portfolioPerformanceQuery } from './portfolio-api';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { longDay } from '../ledger/format';
import { ZeitraumSwitch } from './frame';
import { useZeitraum } from './zeitraum';
import { monthTickLabel, monthTicks, portfolioIndexAxis } from './networth-model';
import { AppLink } from '../shell/app-link';
import { useElementWidth } from '../charts/use-element-width';

const percent = (rate: number) =>
  `${rate < 0 ? '−' : '+'}${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(Math.abs(rate) * 100)} %`;

/** Read the same time-weighted history as Reports; only chart geometry lives here. */
export function PortfolioOverview() {
  useAmountPrivacy();
  const [period] = useZeitraum();
  const [chartFrameRef, chartFrameWidth] = useElementWidth<HTMLDivElement>();
  const query = useQuery(portfolioPerformanceQuery(period));
  const performance = query.data?.portfolio.performance;
  const index = query.data?.portfolio.performanceHistory?.dailyIndex ?? [];
  const valued = index.filter((point) => point.portfolio !== null);
  const hasHistory = valued.length > 1;
  const axis = portfolioIndexAxis(valued.map((point) => point.portfolio!));
  const renderedWidth = chartFrameWidth || 340;
  const width = renderedWidth,
    height = 210,
    left = 58,
    right = 16,
    top = 20,
    bottom = 30;
  const firstDay = Date.parse(`${index[0]?.date ?? '1970-01-01'}T00:00:00Z`);
  const lastDay = Date.parse(`${index.at(-1)?.date ?? '1970-01-01'}T00:00:00Z`);
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
  const segments: { date: string; portfolio: number }[][] = [];
  let segment: { date: string; portfolio: number }[] = [];
  for (const point of index) {
    if (point.portfolio === null) {
      if (segment.length > 0) segments.push(segment);
      segment = [];
    } else segment.push({ date: point.date, portfolio: point.portfolio });
  }
  if (segment.length > 0) segments.push(segment);
  const dateLabel = (date: string) =>
    new Intl.DateTimeFormat('de-AT', {
      day: '2-digit',
      month: '2-digit',
      ...(crossesCalendarYear ? { year: '2-digit' as const } : {}),
      timeZone: 'UTC',
    }).format(new Date(`${date}T12:00:00Z`));
  return (
    <section className="portfolio-overview" aria-label="Portfolioentwicklung">
      <div className="head">
        <h2>Verlauf</h2>
        <ZeitraumSwitch />
      </div>
      {query.isPending && <LoadingNote what="Portfolioentwicklung" />}
      {query.isError && (
        <ErrorNote
          what="Portfolioentwicklung"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {performance && (
        <details className="wealth-details">
          <summary data-testid="portfolio-return">
            Rendite p. a.{' '}
            {Number.isFinite(performance.ttwrorAnnualised) && performance.days > 0
              ? percent(performance.ttwrorAnnualised)
              : '—'}{' '}
            (zeitgewichtet) <Info size={18} strokeWidth={1.75} aria-hidden="true" />
          </summary>
          <p className="vnote">
            Zeitgewichtete Rendite nach Portfolio Performance, auf ein Jahr umgerechnet. Zuflüsse
            zählen am Tagesanfang, Abflüsse am Tagesende. Wertpapiere ohne Depotkassa: nach
            Gebühren, vor Steuern. {longDay(performance.from)} bis {longDay(performance.to)}. Kurze
            Zeiträume können stark schwanken. Die Renditen werden auf Basis 100 verkettet. Ohne
            Kapital einschließlich Tageszuflüssen bleibt der betreffende Tag als Lücke sichtbar; die
            Linie zeigt dieselbe zeitgewichtete Entwicklung wie die Reports.
          </p>
        </details>
      )}
      {hasHistory ? (
        <div className="portfolio-chart-frame" ref={chartFrameRef}>
          <ChartSvg
            width={width}
            height={height}
            label="Portfolioentwicklung, zeitgewichtet, Indexbasis 100"
            testId="portfolio-overview-chart"
            tooltipNote="Tägliche Bewertungswerte; gespeicherte Kurse können bis zum nächsten gespeicherten Kurs fortgeschrieben sein."
            points={index.map((p) => ({
              x: x(p.date),
              date: p.date,
              series: [
                {
                  name: 'Entwicklung (Indexbasis 100)',
                  value:
                    p.portfolio === null
                      ? 'Keine berechenbare Tagesrendite'
                      : new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(
                          p.portfolio,
                        ),
                  color: 'var(--line)',
                },
              ],
            }))}
          >
            {axis.ticks.map((tick) => (
              <g key={tick}>
                <line
                  x1={left}
                  x2={width - right}
                  y1={y(tick)}
                  y2={y(tick)}
                  className="graticule"
                />
                <text x={left - 8} y={y(tick) + 4} textAnchor="end" className="svg-label">
                  {new Intl.NumberFormat('de-AT', {
                    maximumFractionDigits: axis.fractionDigits,
                  }).format(tick)}
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
            {segments.map((points, i) =>
              points.length > 1 ? (
                <Line
                  key={i}
                  kind="actual"
                  draw={false}
                  points={points.map((point) => [x(point.date), y(point.portfolio)])}
                />
              ) : (
                <circle
                  key={i}
                  cx={x(points[0]!.date)}
                  cy={y(points[0]!.portfolio)}
                  r={3}
                  className="dot-actual"
                />
              ),
            )}
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
              {dateLabel(index[0]!.date)}
            </text>
            <text x={width - right} y={height - 4} textAnchor="end" className="svg-label">
              {dateLabel(index.at(-1)!.date)}
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
