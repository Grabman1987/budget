import { useAmountPrivacy, DimensionChain, Button, Segmented } from '@budget/ui';
import { cents, type Period } from '@budget/domain';
import type { PortfolioSummary } from '@budget/db';
import { useQuery, queryOptions } from '@tanstack/react-query';
import { useZeitraum, ZEITRAUM_VALUES } from '../wealth/zeitraum';
import { useNavigate } from '@tanstack/react-router';
import { ApiError, request } from '../api/http';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { eur, longDay } from '../ledger/format';
import { periodText } from '../wealth/networth-model';
import { LEDGER_KEY } from '../ledger/queries';
import { PageFrame } from './placeholder-page';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import './portfolio-performance-report.css';

interface PortfolioResponse {
  portfolio: PortfolioSummary;
}

const portfolioPerformanceQuery = (period: Period) =>
  queryOptions({
    queryKey: [...LEDGER_KEY, 'portfolio-performance-report', period, 'securities'],
    retry: false,
    queryFn: () =>
      request<PortfolioResponse>('GET', `/api/portfolio?period=${period}&view=securities`),
  });

const PERIOD_OPTIONS = ZEITRAUM_VALUES.map((value) => ({ value, label: value }));

const percent = (value: unknown): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '–';
  const percentage = Math.abs(value) * 100;
  if (!Number.isFinite(percentage)) return '–';
  const sign = value < 0 ? '−' : value > 0 ? '+' : '';
  return `${sign}${new Intl.NumberFormat('de-AT', { maximumFractionDigits: 1 }).format(
    percentage,
  )} %`;
};

const periodAmount = (label: string, value: number) => ({
  label,
  value: cents(Math.abs(value)),
  op: value >= 0 ? ('+' as const) : ('-' as const),
});

export function PortfolioPerformanceReport({
  report,
  meta,
}: {
  report: ReportEntry;
  meta: PageMeta;
}) {
  useAmountPrivacy();
  const [period, setPeriod] = useZeitraum();
  const query = useQuery(portfolioPerformanceQuery(period));
  const navigate = useNavigate();

  return (
    <PageFrame
      meta={meta}
      title={report.name}
      subtitle={`${report.pos} · ${report.question}`}
      reportDataBasis={
        query.isError
          ? 'nicht verfügbar'
          : query.data?.portfolio.performance
            ? `${longDay(query.data.portfolio.performance.from)} bis ${longDay(query.data.portfolio.performance.to)}`
            : query.data
              ? 'keine Renditehistorie'
              : 'wird geladen'
      }
      extraFields={[
        { label: 'Zeitraum', value: <PeriodControl period={period} onChange={setPeriod} /> },
      ]}
    >
      <div className="kview vview portfolio-performance-report">
        {query.isPending && <LoadingNote what="Portfolioauswertung" />}
        {query.isError &&
          (query.error instanceof ApiError && query.error.code === 'valuation_unavailable' ? (
            <div className="performance-unavailable" role="alert">
              <div>
                <strong>Portfolioauswertung nicht verfügbar.</strong>
                <p>
                  Es fehlt ein benötigter Wertpapierkurs oder Wechselkurs.{' '}
                  {query.error.detail ??
                    'Die Bewertung kann deshalb nicht vollständig erstellt werden.'}
                </p>
                <p>
                  Die Gesamtauswertung einschließlich der realisierten Gewinne ist deshalb nicht
                  verfügbar.
                </p>
                <Button variant="ghost" size="sm" onClick={() => void query.refetch()}>
                  Erneut versuchen
                </Button>
              </div>
            </div>
          ) : (
            <ErrorNote
              what="Portfolioauswertung"
              error={query.error}
              onRetry={() => void query.refetch()}
            />
          ))}
        {!query.isError && query.data && (
          <PerformanceBody
            summary={query.data.portfolio}
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
      </div>
    </PageFrame>
  );
}

function PeriodControl({
  period,
  onChange,
}: {
  period: Period;
  onChange: (period: Period) => void;
}) {
  useAmountPrivacy();
  return (
    <Segmented
      label="Zeitraum"
      options={PERIOD_OPTIONS}
      value={period}
      onChange={onChange}
      className="seg-period"
    />
  );
}

function PerformanceBody({
  summary,
  onOpenPortfolio,
}: {
  summary: PortfolioSummary;
  onOpenPortfolio: () => void;
}) {
  useAmountPrivacy();
  const performance = summary.performance;

  return (
    <>
      <section
        className="vnw vnw-wide performance-window"
        aria-labelledby="performance-window-title"
      >
        <div className="tbd-head">
          <h2 id="performance-window-title">
            Wertpapiere ·{' '}
            {performance ? periodText(summary.period, performance.from) : 'ohne Historie'}
          </h2>
          <span className="tbd-state">Ansicht ohne Depotkassa</span>
        </div>
        {performance ? (
          <>
            <div className="performance-primary">
              <span className="tech">
                TTWROR im Zeitraum · {performance.days} Tage · {performance.monthCount} bewertete
                Monate
              </span>
              <strong data-testid="period-ttwror">{percent(performance.ttwror)}</strong>
            </div>
            <DimensionChain
              terms={[
                { label: 'Anfang', value: cents(performance.startValueCents) },
                periodAmount('Nettozuflüsse', performance.contributionsCents),
                periodAmount('Periodengewinn', performance.gainCents),
                { label: 'Ende', value: cents(performance.endValueCents), op: '=', result: true },
              ]}
              label="Maßkette Portfolioleistung im gewählten Zeitraum"
            />
            <dl className="performance-metrics" aria-label="Kennzahlen des gewählten Zeitraums">
              <Metric label="TTWROR annualisiert" value={percent(performance.ttwrorAnnualised)} />
              <Metric
                label="Geldgewichtet, Modified Dietz"
                value={percent(performance.moneyWeighted)}
                note={performance.days > 365 ? 'annualisiert' : 'nicht annualisiert'}
              />
              <Metric
                label="XIRR annualisiert"
                value={percent(performance.xirr)}
                note={
                  performance.xirr === null ? 'für diesen Zeitraum nicht verfügbar' : 'actual/365'
                }
              />
            </dl>
          </>
        ) : (
          <p className="performance-empty" role="status">
            Für das Portfolio liegt keine Renditehistorie vor. Eine Rendite wird nicht als null
            angenommen.
          </p>
        )}
      </section>
      <section className="performance-realized" aria-labelledby="realized-gain-title">
        <div className="tbd-head">
          <h2 id="realized-gain-title">Realisierte Gewinne</h2>
          <span className="tbd-state">Gesamte gespeicherte Historie</span>
        </div>
        <p className="performance-realized-value" data-testid="realized-gain">
          {eur(summary.realizedGainCents, { sign: true })}
        </p>
        <p className="performance-incomplete" role="status">
          {summary.realizedGainComplete
            ? 'Ergebnis aus den dokumentierten Verkäufen; die Kostenbasis ist vollständig belegt.'
            : 'Bekannter dokumentierter Teilbetrag; die historische Einstandsbasis ist nicht vollständig belegt.'}
        </p>
        <p className="vnote">
          Der Betrag umfasst die gesamte gespeicherte Historie, unabhängig davon, ob heute noch
          Stücke gehalten werden. Er ist nicht die Rendite des gewählten Zeitraums.
        </p>
      </section>
      {summary.positions.length === 0 && performance && (
        <p className="performance-empty" role="status">
          Zum aktuellen Stand sind keine Wertpapierpositionen offen. Dokumentierte Verkaufsdaten
          bleiben oben sichtbar.
        </p>
      )}
      <div className="performance-links">
        <Button variant="ghost" onClick={onOpenPortfolio}>
          Portfolio öffnen
        </Button>
      </div>
    </>
  );
}

function Metric({ label, value, note }: { label: string; value: string; note?: string }) {
  useAmountPrivacy();
  return (
    <div className="performance-metric">
      <dt>{label}</dt>
      <dd>
        {value}
        {note && <small>{note}</small>}
      </dd>
    </div>
  );
}
