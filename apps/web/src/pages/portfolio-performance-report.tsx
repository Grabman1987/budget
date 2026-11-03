import {
  PortfolioMetricsLead,
  PortfolioMetricsDaily,
  PortfolioGainBridge,
} from '../reports/portfolio-metrics-report-body';
import { ReportPeriodControl } from '../reports/period-quick-select';
import { Term } from '../reports/term';
import {
  HistoricalBasisCue,
  historicalBasisReasons,
  PortfolioCalculationDisclosure,
} from '../reports/portfolio-calculation-disclosure-512';
import type { ValuationNote } from '../ledger/valuation-hint';
import { useId, useState, type ReactNode } from 'react';
import { useAmountPrivacy, DimensionChain, Button } from '@budget/ui';
import { cents, type Period } from '@budget/domain';
import type { PortfolioSummary } from '@budget/db';
import { useQuery } from '@tanstack/react-query';
import { useZeitraum, ZEITRAUM_VALUES } from '../wealth/zeitraum';
import { useNavigate, useSearch } from '@tanstack/react-router';
import { userText } from '../api/error-text';
import { ApiError } from '../api/http';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { eur, longDay } from '../ledger/format';
import { periodText } from '../wealth/networth-model';
import { portfolioPerformanceQuery } from '../wealth/portfolio-api';
import { ReportFrame as PageFrame } from '../reports/report-frame';
import type { PageMeta } from '../nav/pages';
import type { ReportEntry } from '../nav/reports-catalog';
import './portfolio-performance-report.css';
import '../reports/wealth-portfolio-redesign.css';
import { REDESIGN_ENABLED } from '../shell/redesign-flag';
import { PortfolioMetrics } from '../wealth/portfolio-metrics';
import { PortfolioClassHistories } from '../wealth/portfolio-class-histories';
import { PerformanceComparisons } from './portfolio-performance-comparisons';
import { PortfolioRegisters } from '../wealth/portfolio-registers';

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
  viewControl,
  presentation = 'all',
}: {
  report: ReportEntry;
  meta: PageMeta;
  viewControl?: ReactNode;
  presentation?: 'all' | 'kennzahlen' | 'klassen';
}) {
  useAmountPrivacy();
  const [period, setPeriod] = useZeitraum();
  const query = useQuery(portfolioPerformanceQuery(period));
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { ansicht?: string };
  const retainedMetrics =
    REDESIGN_ENABLED &&
    presentation === 'all' &&
    ['kennzahlen', 'analyse'].includes(search.ansicht ?? '');
  const perf = query.data?.portfolio.performance;
  const latestClass = query.data?.portfolio.performanceHistory?.classes[0];

  return (
    <PageFrame
      sourceDate={perf?.to}
      calculation={
        perf && !query.isFetching && !query.isError && presentation === 'all'
          ? {
              label: 'Wertpapiere ohne Depotkassa im Zeitraum',
              terms: [
                { label: 'Anfang', value: cents(perf.startValueCents) },
                periodAmount('Nettozuflüsse', perf.contributionsCents),
                periodAmount('Periodengewinn', perf.gainCents),
              ],
              result: {
                label: 'Wert am Ende · Wertpapiere ohne Depotkassa',
                unit: 'money',
                value: perf.endValueCents,
              },
            }
          : undefined
      }
      verdict={
        query.data && !query.isFetching && !query.isError
          ? {
              reportId: report.id,
              period: `${query.data.portfolio.performance?.from}..${query.data.portfolio.performance?.to}`,
              estimated: Boolean(query.data.incomplete?.length),
              metric: {
                label:
                  presentation === 'kennzahlen'
                    ? 'TTWROR p. a. · Wertpapiere ohne Depotkassa'
                    : presentation === 'klassen'
                      ? `Index · ${latestClass?.name ?? 'Anlageklasse'} · Start = 100`
                      : 'Periodenergebnis',
                value:
                  presentation === 'kennzahlen'
                    ? perf?.ttwrorAnnualised == null
                      ? null
                      : perf.ttwrorAnnualised * 10000
                    : presentation === 'klassen'
                      ? (latestClass?.index.at(-1)?.portfolio ?? null)
                      : (perf?.gainCents ?? null),
                unit:
                  presentation === 'kennzahlen'
                    ? 'percent'
                    : presentation === 'klassen'
                      ? 'count'
                      : 'money',
                better: 'higher',
              },
            }
          : undefined
      }
      meta={meta}
      reportControls={viewControl}
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
      <div className="kview vview portfolio-performance-report" data-presentation={presentation}>
        {query.isPending && <LoadingNote what="Portfolioauswertung" />}
        {query.isError &&
          (query.error instanceof ApiError && query.error.code === 'valuation_unavailable' ? (
            <div className="performance-unavailable" role="alert">
              <div>
                <strong>Portfolioauswertung nicht verfügbar.</strong>
                <p>
                  Es fehlt ein benötigter Wertpapierkurs oder Wechselkurs.{' '}
                  {userText(
                    query.error.detail,
                    'Die Bewertung kann deshalb nicht vollständig erstellt werden.',
                  )}
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
        {!query.isError &&
          query.data &&
          (retainedMetrics ? (
            <>
              <PortfolioRegisters current="metrics" period={period} />
              <PortfolioMetrics />
            </>
          ) : (
            <PerformanceBody
              presentation={presentation}
              summary={query.data.portfolio}
              incomplete={query.data.incomplete}
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
          ))}
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
    <ReportPeriodControl
      trend={false}
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
  presentation,
  incomplete,
  onOpenPortfolio,
}: {
  summary: PortfolioSummary;
  presentation: 'all' | 'kennzahlen' | 'klassen';
  incomplete?: ValuationNote[] | undefined;
  onOpenPortfolio: () => void;
}) {
  useAmountPrivacy();
  const performance = summary.performance;
  const basisId = useId();
  const sourceId = useId();
  const basisReasons = historicalBasisReasons(summary);

  return (
    <>
      {REDESIGN_ENABLED && presentation === 'kennzahlen' ? (
        <PortfolioMetricsLead summary={summary} incomplete={incomplete} />
      ) : (
        <>
          {' '}
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
                    <Term>TTWROR</Term> im Zeitraum · {performance.days} Tage ·{' '}
                    {performance.monthCount} bewertete Monate
                  </span>
                  <strong
                    data-testid="period-ttwror"
                    aria-describedby={basisReasons.length ? basisId : undefined}
                  >
                    {percent(performance.ttwror)}
                  </strong>
                </div>
                <HistoricalBasisCue reasons={basisReasons} id={basisId} sourceId={sourceId} />
                <p className="vnote">
                  TTWROR und XIRR nach Portfolio Performance: Wertpapiere ohne Depotkassa, nach
                  Gebühren und vor Steuern. TTWROR zählt Zuflüsse am Tagesanfang und Abflüsse am
                  Tagesende. Periodengewinn und Nettozuflüsse verwenden die tatsächlichen Beträge
                  nach Steuern.
                </p>
                <DimensionChain
                  terms={[
                    { label: 'Anfang', value: cents(performance.startValueCents) },
                    periodAmount('Nettozuflüsse', performance.contributionsCents),
                    periodAmount('Periodengewinn', performance.gainCents),
                    {
                      label: 'Ende',
                      value: cents(performance.endValueCents),
                      op: '=',
                      result: true,
                    },
                  ]}
                  label="Maßkette Portfolioleistung im gewählten Zeitraum"
                />
                <dl className="performance-metrics" aria-label="Kennzahlen des gewählten Zeitraums">
                  <Metric
                    label={
                      <>
                        <Term>TTWROR</Term> annualisiert
                      </>
                    }
                    value={percent(performance.ttwrorAnnualised)}
                    note={
                      performance.ttwrorAnnualised === null
                        ? 'für diesen Zeitraum nicht verfügbar'
                        : ''
                    }
                  />
                  <Metric
                    label={
                      <>
                        <Term>XIRR</Term> annualisiert
                      </>
                    }
                    value={percent(performance.xirr)}
                    note={
                      performance.xirr === null
                        ? 'für diesen Zeitraum nicht verfügbar'
                        : 'actual/365'
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
            <PortfolioCalculationDisclosure
              summary={summary}
              incomplete={incomplete}
              sourceId={sourceId}
            />
          </section>
        </>
      )}
      {REDESIGN_ENABLED && presentation === 'kennzahlen' && <PortfolioMetricsDaily />}

      <PerformanceComparisons
        summary={summary}
        presentation={REDESIGN_ENABLED ? presentation : 'all'}
      />
      {REDESIGN_ENABLED && presentation === 'klassen' && summary.performanceHistory && (
        <details className="performance-class-history">
          <summary>Monatliche Klassenverläufe und Werte</summary>
          <PortfolioClassHistories history={summary.performanceHistory} />
        </details>
      )}
      {REDESIGN_ENABLED && presentation === 'kennzahlen' ? (
        <PortfolioGainBridge summary={summary} />
      ) : (
        <>
          {' '}
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
        </>
      )}
      {summary.positions.length === 0 && performance && (
        <p className="performance-empty" role="status">
          Zum aktuellen Stand sind keine Wertpapierpositionen offen. Dokumentierte Verkaufsdaten
          bleiben oben sichtbar.
        </p>
      )}
      {REDESIGN_ENABLED && presentation !== 'klassen' && <RetainedPortfolioMetrics />}
      <div className="performance-links">
        <Button variant="ghost" onClick={onOpenPortfolio}>
          Portfolio öffnen
        </Button>
      </div>
    </>
  );
}

function RetainedPortfolioMetrics() {
  const [open, setOpen] = useState(false);
  return (
    <details
      className="performance-metrics-retained"
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary>Kennzahlen, Zahlungsströme und Bewertungsquellen im Detail</summary>
      {open && <PortfolioMetrics />}
    </details>
  );
}

function Metric({ label, value, note }: { label: ReactNode; value: string; note?: string }) {
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
