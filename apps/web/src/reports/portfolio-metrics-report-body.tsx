import { useId } from 'react';
import { useQueries, useQuery } from '@tanstack/react-query';
import type { PortfolioSummary } from '@budget/db';
import { cents } from '@budget/domain';
import { DimensionChain, privateAmount, useAmountPrivacy } from '@budget/ui';
import { eur, longDay } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { ValuationHint, type ValuationNote } from '../ledger/valuation-hint';
import { percentText } from '../pages/portfolio-report-shared';
import { useZeitraum } from '../wealth/zeitraum';
import { portfolioPerformanceQuery } from '../wealth/portfolio-api';
import { PortfolioGainComponents } from './portfolio-gain-components';
import { Term } from './term';
import { netWorthHistoryQuery } from './wealth-history-api';
import { WealthHistoryChart } from './wealth-history-chart';
import {
  HistoricalBasisCue,
  historicalBasisReasons,
  PortfolioCalculationDisclosure,
} from './portfolio-calculation-disclosure-512';

const privateRate = (value: number | null | undefined) =>
  value == null || !Number.isFinite(value)
    ? '–'
    : privateAmount(percentText(value, { sign: true }));

/** Compact report presentation of the existing security-return facts; all sources remain available. */
export function PortfolioMetricsLead({
  summary,
  incomplete,
}: {
  summary: PortfolioSummary;
  incomplete?: ValuationNote[] | undefined;
}) {
  useAmountPrivacy();
  const basisId = useId();
  const sourceId = useId();
  const performance = summary.performance;
  const periods = ['YTD', '1J', '3J', 'Alles'] as const;
  const comparisons = useQueries({ queries: periods.map(portfolioPerformanceQuery) });
  return (
    <section className="performance-window" aria-labelledby="metrics-lead-title">
      <h2 id="metrics-lead-title">Rendite · Wertpapiere ohne Depotkassa</h2>
      {performance ? (
        <>
          <div
            className="rscroll"
            role="region"
            aria-label="Zeit- und kapitalgewichtete Rendite"
            // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users scroll all return columns.
            tabIndex={0}
          >
            <table className="rtable metrics-lead-table">
              <thead>
                <tr>
                  <th scope="col">Methode</th>
                  {['YTD', '1 J', '3 J p. a.', 'Seit Beginn p. a.'].map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">
                    <Term>TTWROR</Term>
                  </th>
                  {comparisons.map((query, index) => (
                    <td key={periods[index]}>
                      {query.isPending
                        ? 'Lädt …'
                        : query.isError
                          ? 'Nicht verfügbar'
                          : privateRate(
                              index < 2
                                ? query.data?.portfolio.performance?.ttwror
                                : query.data?.portfolio.performance?.ttwrorAnnualised,
                            )}
                    </td>
                  ))}
                </tr>
                <tr>
                  <th scope="row">
                    <Term>XIRR</Term> · actual/365
                  </th>
                  {comparisons.map((query, index) => (
                    <td key={periods[index]}>
                      {query.isPending
                        ? 'Lädt …'
                        : query.isError
                          ? 'Nicht verfügbar'
                          : privateRate(query.data?.portfolio.performance?.xirr)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="vnote">
            Wertpapiere ohne Depotkassa · nach Gebühren, vor Steuern. XIRR immer p. a. (actual/365).
            Gewählter Zeitraum: TTWROR {privateRate(performance.ttwror)} · XIRR{' '}
            {privateRate(performance.xirr)} p. a.
          </p>
          {comparisons.some((query) => query.isError) && (
            <ErrorNote
              what="Vergleichszeiträume"
              error={comparisons.find((query) => query.isError)?.error}
              onRetry={() => {
                for (const query of comparisons) if (query.isError) void query.refetch();
              }}
            />
          )}
          <HistoricalBasisCue
            reasons={historicalBasisReasons(summary)}
            id={basisId}
            sourceId={sourceId}
          />
        </>
      ) : (
        <p role="status">
          Keine berechenbare Renditehistorie. Fehlende Werte bleiben nicht verfügbar.
        </p>
      )}
      <details>
        <summary>Berechnung und Bewertungsquellen</summary>
        <p className="vnote">
          Vergleichsspalten verwenden jeweils ihre tatsächlich verfügbare Historie. Ein späterer
          Beginn verkürzt das beschriftete Fenster; fehlende Renditen bleiben nicht verfügbar.
        </p>
        {comparisons.map((query, index) => {
          const compared = query.isSuccess ? query.data.portfolio : undefined;
          const window = compared?.performance;
          return (
            <details key={periods[index]}>
              <summary>
                {periods[index]} ·{' '}
                {window
                  ? `${longDay(window.from)} bis ${longDay(window.to)} · ${window.days} Tage`
                  : 'Keine berechenbare Historie'}
              </summary>
              {compared && (
                <>
                  <HistoricalBasisCue
                    reasons={historicalBasisReasons(compared)}
                    id={`${basisId}-${index}`}
                    sourceId={`${sourceId}-${index}`}
                  />
                  <PortfolioCalculationDisclosure
                    summary={compared}
                    incomplete={query.data?.incomplete}
                    sourceId={`${sourceId}-${index}`}
                  />
                </>
              )}
            </details>
          );
        })}
        <PortfolioCalculationDisclosure
          summary={summary}
          incomplete={incomplete}
          sourceId={sourceId}
        />
      </details>
    </section>
  );
}

/** Wealth scope is explicit: this daily series includes all accounts, not only the return universe. */
export function PortfolioMetricsDaily() {
  useAmountPrivacy();
  const [period] = useZeitraum();
  const query = useQuery(netWorthHistoryQuery(period));
  return (
    <section className="portfolio-metrics-daily" aria-labelledby="metrics-daily-title">
      <h2 id="metrics-daily-title">Nettovermögen pro Tag · alle Konten</h2>
      {query.isPending && <LoadingNote what="Tägliches Nettovermögen" />}
      {query.isError && (
        <ErrorNote
          what="Tägliches Nettovermögen"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isSuccess && (
        <>
          <p className="vnote">
            {longDay(query.data.from)} bis {longDay(query.data.to)} · Tagesschlusswerte aller
            Konten.
          </p>
          <ValuationHint incomplete={query.data.incomplete} />
        </>
      )}
      {query.isSuccess &&
        (query.data.daily.length > 1 ? (
          <WealthHistoryChart history={query.data} dailyOnly compact />
        ) : (
          <p className="vnote">Keine tägliche Vermögenshistorie für diesen Zeitraum.</p>
        ))}
    </section>
  );
}

/** Same-period gain bridge, with separately labelled lifetime basis/gains; no mixed-window waterfall. */
export function PortfolioGainBridge({ summary }: { summary: PortfolioSummary }) {
  useAmountPrivacy();
  const performance = summary.performance;
  const flows = performance?.contributionsCents ?? null;
  return (
    <section
      className="performance-realized performance-gain-bridge"
      aria-labelledby="period-gain-title"
    >
      <h2 id="period-gain-title">Gewinn im Zeitraum</h2>
      {performance && flows !== null ? (
        <>
          <strong className="performance-realized-value" data-testid="metrics-period-gain">
            {eur(performance.gainCents, { sign: true })}
          </strong>
          <PortfolioGainComponents
            from={performance.from}
            to={performance.to}
            gainCents={performance.gainCents}
          />
          <details>
            <summary>Abgleich mit Anfang, Ende und Nettozuflüssen</summary>
            <DimensionChain
              label="Gewinn aus Endwert minus Anfang minus Nettozuflüsse"
              terms={[
                { label: 'Endwert', value: cents(performance.endValueCents) },
                { op: '-', label: 'Anfang', value: cents(performance.startValueCents) },
                {
                  op: flows < 0 ? '+' : '-',
                  label: 'Nettozuflüsse',
                  value: cents(Math.abs(flows)),
                },
                { op: '=', label: 'Gewinn', value: cents(performance.gainCents), result: true },
              ]}
              precision="cent"
            />
            <p className="vnote">
              Wertpapiere ohne Depotkassa · tatsächliche Nettoflüsse nach Steuern. Keine Mischung
              mit Erträgen und Kosten eines anderen Zeitraums.
            </p>
          </details>
        </>
      ) : (
        <p role="status">Periodengewinn nicht verfügbar.</p>
      )}
      <details>
        <summary>Einstand und realisierte Gewinne</summary>
        <dl>
          <div>
            <dt>Nicht realisiert · heutiger Bestand</dt>
            <dd>
              {summary.gainCents === null
                ? 'Einstand fehlt'
                : eur(summary.gainCents, { sign: true })}
            </dd>
          </div>
          <div>
            <dt>Realisiert · gesamte gespeicherte Historie</dt>
            <dd>{eur(summary.realizedGainCents, { sign: true })}</dd>
          </div>
        </dl>
        <p className="vnote">
          {summary.realizedGainComplete
            ? 'Dokumentierte Verkäufe mit vollständiger Einstandsbasis.'
            : 'Bekannter Teilbetrag; die historische Einstandsbasis ist unvollständig.'}
        </p>
      </details>
    </section>
  );
}
