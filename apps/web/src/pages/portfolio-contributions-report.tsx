import { ChartSvg } from '@budget/ui';
import { chartPoints } from '../charts/tooltip-data';
import { ReportPeriodControl } from '../reports/period-quick-select';
import { useAmountPrivacy, DimensionChain, Button, TrendLine } from '@budget/ui';
import { balanceChain, cents, type Period } from '@budget/domain';
import type { PortfolioSummary, ContributionHistory } from '@budget/db';
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useZeitraum, ZEITRAUM_VALUES } from '../wealth/zeitraum';
import { userText } from '../api/error-text';
import { ApiError, request } from '../api/http';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { type WithValuationNotes } from '../ledger/valuation-hint';
import { longDay, eur } from '../ledger/format';
import { periodText } from '../wealth/networth-model';
import { LEDGER_KEY } from '../ledger/queries';
import { PageFrame } from './placeholder-page';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import './portfolio-contributions-report.css';

interface ContributionsPortfolio extends PortfolioSummary {
  contributionHistory?: ContributionHistory | null;
}
interface PortfolioResponse extends WithValuationNotes {
  portfolio: ContributionsPortfolio;
}

const contributionsQuery = (period: Period) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'portfolio-contributions-report', period, 'securities'],
    retry: false,
    queryFn: () =>
      request<PortfolioResponse>(
        'GET',
        `/api/portfolio?period=${period}&view=securities&history=contributions`,
      ),
  });

const PERIOD_OPTIONS = ZEITRAUM_VALUES.map((value) => ({ value, label: value }));

export function PortfolioContributionsReport({
  report,
  meta,
}: {
  report: ReportEntry;
  meta: PageMeta;
}) {
  useAmountPrivacy();
  const [period, setPeriod] = useZeitraum();
  const query = useQuery(contributionsQuery(period));
  const navigate = useNavigate();
  const history = query.data?.portfolio.contributionHistory;

  return (
    <PageFrame
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        query.isError
          ? 'nicht verfügbar'
          : history
            ? `${longDay(history.from)} bis ${longDay(history.to)}`
            : query.data
              ? 'keine Wertpapierhistorie'
              : 'wird geladen'
      }
      extraFields={[
        {
          label: 'Zeitraum',
          value: (
            <ReportPeriodControl
              label="Zeitraum"
              options={PERIOD_OPTIONS}
              value={period}
              onChange={setPeriod}
              className="seg-period"
            />
          ),
        },
      ]}
    >
      <div className="kview vview portfolio-contributions-report">
        {query.isPending && <LoadingNote what="Einzahlungen und Wert" />}
        {query.isError &&
          (query.error instanceof ApiError && query.error.code === 'valuation_unavailable' ? (
            <div className="contributions-unavailable" role="alert">
              <div>
                <strong>Wertpapierbewertung nicht verfügbar.</strong>
                <p>
                  Für den gewählten Zeitraum fehlt ein benötigter Kurs oder Wechselkurs.{' '}
                  {userText(
                    query.error.detail,
                    'Die Wertentwicklung kann deshalb nicht vollständig berechnet werden.',
                  )}
                </p>
                <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
                  Erneut versuchen
                </Button>
              </div>
            </div>
          ) : (
            <ErrorNote
              what="Einzahlungen und Wert"
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          ))}
        {!query.isError && query.data && history && (
          <ContributionsBody
            summary={query.data.portfolio}
            estimated={Boolean(query.data.incomplete?.length)}
            history={history}
            period={period}
            onOpenPortfolio={() =>
              void navigate({
                to: '/vermoegen/portfolio',
                search: ((previous: Record<string, unknown>) => ({
                  ...previous,
                  produkt: undefined,
                })) as never,
              })
            }
          />
        )}
        {!query.isError && query.data && history === null && (
          <p className="contributions-empty" role="status">
            Für die Wertpapiere liegt noch keine bewertbare Historie vor. Es wird kein Anfangswert
            oder Nullertrag angenommen.
          </p>
        )}
      </div>
    </PageFrame>
  );
}

function ContributionsBody({
  summary,
  estimated,
  history,
  period,
  onOpenPortfolio,
}: {
  summary: ContributionsPortfolio;
  estimated: boolean;
  history: ContributionHistory;
  period: Period;
  onOpenPortfolio: () => void;
}) {
  useAmountPrivacy();
  const flowAmount = (label: string, value: number) => ({
    label,
    value: cents(Math.abs(value)),
    op: value >= 0 ? ('+' as const) : ('-' as const),
  });
  const chainTerms = [
    { label: 'Wert am Anfang', value: cents(history.startValueCents) },
    flowAmount('Nettozuflüsse / Entnahmen', history.contributionsCents),
    flowAmount('Wertänderung', history.gainCents),
    { label: 'Wert am Ende', value: cents(history.endValueCents), op: '=' as const, result: true },
  ];
  let chainPrecision: 'cent' | 'euro' = 'euro';
  try {
    // Use the shared display balancer as the boundary check: balancing can move its rounding
    // residue into a large term even when each independently rounded term is still safe.
    balanceChain(chainTerms, 'euro');
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    chainPrecision = 'cent';
  }
  return (
    <>
      <section className="vnw vnw-wide contributions-window" aria-labelledby="contributions-title">
        <div className="tbd-head">
          <h2 id="contributions-title">Wertpapiere · {periodText(period, history.from)}</h2>
          <span className="tbd-state">Wertpapieransicht ohne Depotkassa</span>
        </div>
        <p className="contributions-period" data-testid="contributions-period">
          {longDay(history.from)} bis {longDay(history.to)} · {summary.performance?.days ?? 0} Tage
        </p>
        <div className="contributions-primary">
          <span className="tech">Wert am Ende des Zeitraums</span>
          <strong data-testid="contributions-end-value">
            {estimated && <abbr title="Teilweise geschätzt">≈</abbr>}
            {eur(history.endValueCents)}
          </strong>
        </div>
        <DimensionChain
          terms={chainTerms}
          precision={chainPrecision}
          label="Maßkette Einzahlungen und Wert"
        />
        <ContributionsChart history={history} />
        <p className="vnote">
          Dargestellt sind Wertpapiere ohne Depotkassa. Käufe, Einlieferungen, Gebühren und Steuern
          zählen als positive Flüsse; Verkäufe, Auslieferungen und ausgezahlte Erträge als negative
          Flüsse. Eine Zuordnung zu Sparplänen oder R12-Sonderzahlungen ist in den Quelldaten nicht
          enthalten.
        </p>
      </section>
      <section className="contributions-years" aria-labelledby="contributions-years-title">
        <div className="tbd-head">
          <h2 id="contributions-years-title">Je Kalenderjahr im Zeitraum</h2>
        </div>
        <div
          className="rscroll"
          role="region"
          aria-label="Jahrestabelle, bei Bedarf horizontal verschiebbar"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the complete yearly table.
          tabIndex={0}
        >
          <table className="rtable">
            <thead>
              <tr>
                <th>Jahr</th>
                <th className="n">Anfang</th>
                <th className="n">Nettozuflüsse / Entnahmen</th>
                <th className="n">Wertänderung</th>
                <th className="n">Ende</th>
              </tr>
            </thead>
            <tbody>
              {history.years.map(({ year, performance }) => (
                <tr key={year}>
                  <td>
                    {year}
                    {performance.monthCount < 12 ? (
                      <small className="muted">{performance.monthCount} Monate</small>
                    ) : null}
                  </td>
                  <td className="n">{eur(performance.startValueCents)}</td>
                  <td className="n">{eur(performance.contributionsCents, { sign: true })}</td>
                  <td className="n">{eur(performance.gainCents, { sign: true })}</td>
                  <td className="n">
                    <strong>{eur(performance.endValueCents)}</strong>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="vnote">
          Jahreswerte verwenden dieselben gespeicherten Wertpapierflüsse und Tagesbewertungen wie
          die Zeitraumansicht.
        </p>
      </section>
      <div className="contributions-links">
        <Button variant="ghost" onClick={onOpenPortfolio}>
          Portfolio öffnen
        </Button>
      </div>
    </>
  );
}

function ContributionsChart({ history }: { history: ContributionHistory }) {
  useAmountPrivacy();
  const rows = history.months;
  const daily = history.daily;
  const values = daily.map((row) => row.valueCents);
  const invested = daily.map((row) => row.investedCents);
  const maxAbsGain = Math.max(1, ...rows.map((row) => Math.abs(row.gainCents)));
  const minValue = Math.min(...values, ...invested);
  const maxValue = Math.max(...values, ...invested);
  const spread = Math.max(1, maxValue - minValue);
  const left = 48;
  const right = 12;
  const top = 12;
  const lineBottom = 150;
  const barTop = 188;
  const barBottom = 270;
  const width = 720;
  const from = Date.parse(history.from);
  const span = Math.max(1, Date.parse(history.to) - from);
  const xDate = (date: string) =>
    left + ((Date.parse(date) - from) / span) * (width - left - right);
  const x = (index: number) => xDate(daily[index]!.date);
  const y = (value: number) => top + ((maxValue - value) / spread) * (lineBottom - top);
  const zero = (barTop + barBottom) / 2;
  const valuePath = values
    .map((value, index) => `${index ? 'L' : 'M'}${x(index)},${y(value)}`)
    .join(' ');
  const investedPath = invested
    .map((value, index) => `${index ? 'L' : 'M'}${x(index)},${y(value)}`)
    .join(' ');
  return (
    <div
      className="contributions-chart-wrap"
      role="region"
      aria-label="Diagramm, bei Bedarf horizontal verschiebbar"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users must be able to scroll the chart on narrow viewports.
      tabIndex={0}
    >
      <ChartSvg
        className="contributions-chart"
        testId="contributions-chart"
        width={width}
        height={286}
        points={chartPoints(
          daily.map((row) => row.date),
          x,
          [
            { name: 'Wert', values },
            {
              name: 'Anfangswert + kumulierte Nettozuflüsse',
              values: invested,
              color: 'var(--line-2)',
            },
          ],
        ).map((p, i) => {
          const row = rows.find((row) => daily[i]!.date > row.from && daily[i]!.date <= row.to);
          return {
            ...p,
            series: [
              ...p.series,
              ...(row
                ? [
                    {
                      name: `Monatliche Wertänderung (${row.from} · ${row.to})`,
                      value: eur(row.gainCents, { sign: true }),
                      color: row.gainCents < 0 ? 'var(--red)' : 'var(--line)',
                    },
                  ]
                : []),
            ],
          };
        })}
        label="Linien für Wertpapierwert und Wert am Anfang zuzüglich kumulierter Nettozuflüsse; Balken zeigen die monatliche Wertänderung nach Nettozuflüssen."
      >
        {[0, 1, 2, 3].map((i) => {
          const value = maxValue === minValue ? maxValue : minValue + (spread * i) / 3;
          const yy = top + ((3 - i) / 3) * (lineBottom - top);
          return (
            <g key={i}>
              <line x1={left} x2={width - right} y1={yy} y2={yy} className="contributions-grid" />
              <text x={left - 6} y={yy + 4} textAnchor="end">
                {eur(Math.round(value))}
              </text>
            </g>
          );
        })}
        {rows.map((row) => {
          const slot = xDate(row.to) - xDate(row.from);
          const height = (Math.abs(row.gainCents) / maxAbsGain) * ((barBottom - barTop) / 2 - 4);
          return (
            <rect
              key={row.to}
              x={(xDate(row.from) + xDate(row.to)) / 2 - slot * 0.27}
              y={row.gainCents >= 0 ? zero - height : zero}
              width={slot * 0.54}
              height={height}
              className={
                row.gainCents >= 0 ? 'contributions-bar-positive' : 'contributions-bar-negative'
              }
            >
              <title>{`${longDay(row.to)}: ${eur(row.gainCents, { sign: true })} Wertänderung`}</title>
            </rect>
          );
        })}
        <path d={investedPath} className="contributions-invested-line" />
        <path d={valuePath} className="contributions-value-line" />
        <TrendLine points={values.map((value, index) => [x(index), y(value)])} />
        <TrendLine
          points={rows.map((row) => [
            (xDate(row.from) + xDate(row.to)) / 2,
            zero - (row.gainCents / maxAbsGain) * ((barBottom - barTop) / 2 - 4),
          ])}
        />
        <line x1={left} x2={width - right} y1={zero} y2={zero} className="contributions-zero" />
        {rows
          .filter(
            (_, index) =>
              index === 0 || index === rows.length - 1 || index % Math.ceil(rows.length / 7) === 0,
          )
          .map((row) => (
            <text
              key={`${row.to}-label`}
              x={(xDate(row.from) + xDate(row.to)) / 2}
              y={barBottom + 15}
              textAnchor="middle"
            >
              {row.to.slice(0, 7)}
            </text>
          ))}
      </ChartSvg>
      <div className="contributions-legend" aria-hidden="true">
        <span>
          <i className="legend-value" />
          Wert
        </span>
        <span>
          <i className="legend-invested" />
          Anfangswert + kumulierte Nettozuflüsse
        </span>
        <span>
          <i className="legend-bars" />
          Monatliche Wertänderung
        </span>
      </div>
    </div>
  );
}
