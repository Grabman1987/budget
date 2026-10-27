import { useId, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { maskMoneyText, privateAmount, useAmountPrivacy } from '@budget/ui';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { eur, longDay } from '../ledger/format';
import { AppLink } from '../shell/app-link';
import { Term } from '../reports/term';
import {
  HistoricalBasisCue,
  historicalBasisReasons,
  PortfolioCalculationDisclosure,
} from '../reports/portfolio-calculation-disclosure-512';
import { percentText, ppText } from '../pages/portfolio-report-shared';
import { portfolioPerformanceQuery } from './portfolio-api';
import { ZeitraumSwitch } from './frame';
import { useZeitraum } from './zeitraum';
import './portfolio-metrics.css';

/** The same query and unrounded metrics as the report; no independent performance calculation. */
export function PortfolioMetrics() {
  useAmountPrivacy();
  const [period] = useZeitraum();
  const query = useQuery(portfolioPerformanceQuery(period));
  const summary = query.isError ? undefined : query.data?.portfolio;
  const performance = summary?.performance;
  const basisId = useId();
  const sourceId = useId();
  const reasons = summary ? historicalBasisReasons(summary) : [];
  const flows =
    summary?.performanceHistory?.dailyValues.filter(
      (row) => row.depositsCents !== 0 || row.withdrawalsCents !== 0,
    ) ?? [];
  return (
    <section className="portfolio-metrics" aria-labelledby="portfolio-metrics-title">
      <div className="head">
        <h2 id="portfolio-metrics-title">Kennzahlen</h2>
        <ZeitraumSwitch />
      </div>
      <p className="vnote">
        Renditebasis: Wertpapiere ohne Depot-Bargeld · nach Gebühren, vor Steuern
      </p>
      {query.isPending && <LoadingNote what="Kennzahlen" />}
      {query.isError && (
        <ErrorNote what="Kennzahlen" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {summary && (
        <>
          {performance ? (
            <div className="portfolio-metrics-columns">
              <div className="portfolio-metrics-values">
                <p className="vnote">
                  {longDay(performance.from)} bis {longDay(performance.to)} · {performance.days}{' '}
                  Tage
                </p>
                <div className="portfolio-metrics-headline">
                  <div className="portfolio-metrics-lead">
                    <span>
                      <Term>TTWROR</Term> im Zeitraum
                    </span>
                    <strong
                      data-testid="metrics-period-ttwror"
                      aria-describedby={reasons.length ? basisId : undefined}
                    >
                      {privateAmount(percentText(performance.ttwror, { sign: true }))}
                    </strong>
                    <span>
                      p. a.{' '}
                      <span data-testid="metrics-annual-ttwror">
                        {privateAmount(percentText(performance.ttwrorAnnualised, { sign: true }))}
                      </span>
                    </span>
                  </div>
                  <div className="portfolio-metrics-lead">
                    <span>
                      <Term>XIRR</Term> p. a.
                    </span>
                    <strong
                      data-testid="metrics-xirr"
                      aria-describedby={reasons.length ? basisId : undefined}
                    >
                      {privateAmount(percentText(performance.xirr, { sign: true }))}
                    </strong>
                  </div>
                </div>
                <HistoricalBasisCue reasons={reasons} id={basisId} sourceId={sourceId} />
                <dl className="portfolio-metrics-grid">
                  <Metric
                    label={
                      <>
                        <Term>Volatilität</Term> p. a.
                      </>
                    }
                    value={privateAmount(percentText(performance.volatility))}
                  />
                  <Metric
                    label={<Term>Max. Rückgang</Term>}
                    value={privateAmount(percentText(performance.maxDrawdown, { sign: true }))}
                  />
                  <Metric
                    label={<Term>Sharpe</Term>}
                    value={
                      performance.volatility !== null &&
                      performance.volatility >= 0.005 &&
                      performance.sharpe !== null
                        ? privateAmount(
                            new Intl.NumberFormat('de-AT', { maximumFractionDigits: 2 }).format(
                              performance.sharpe,
                            ),
                          )
                        : '–'
                    }
                  />
                </dl>
                <p className="vnote">
                  TTWROR neutralisiert Ein- und Auszahlungen; XIRR berücksichtigt deren Zeitpunkt
                  (actual/365). Annualisierte Werte können bei kurzen Zeiträumen stark schwanken.
                  Sharpe: sicherer Zins 2,5 %; unter 0,5 % Volatilität nicht verfügbar.
                </p>
                <h3>Vergleich</h3>
                {summary.benchmarks.length === 0 ? (
                  <p className="vnote">
                    Keine Benchmark gewählt.{' '}
                    <AppLink to="/einstellungen/depots" hash="benchmark-settings-title">
                      Benchmarks auswählen
                    </AppLink>
                  </p>
                ) : (
                  <table className="portfolio-metrics-table">
                    <caption>
                      Kursindex, ohne Ausschüttungen · gleicher Zeitraum und gleiche Startbasis
                    </caption>
                    <thead>
                      <tr>
                        <th scope="col">Benchmark</th>
                        <th scope="col">Rendite</th>
                        <th scope="col">Differenz Portfolio</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.benchmarks.map((benchmark) => (
                        <tr key={benchmark.id}>
                          <th scope="row">{maskMoneyText(benchmark.name)}</th>
                          <td>
                            {privateAmount(percentText(benchmark.benchmarkReturn, { sign: true }))}
                          </td>
                          <td>
                            {privateAmount(
                              ppText(
                                performance.ttwror === null || benchmark.benchmarkReturn === null
                                  ? null
                                  : performance.ttwror - benchmark.benchmarkReturn,
                              ),
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                {summary.benchmarks.some((benchmark) => benchmark.benchmarkReturn === null) && (
                  <p className="vnote">
                    Kurs- oder Wechselkurslücke: Der betroffene Vergleich ist nicht verfügbar.
                    Lücken werden nicht interpoliert.
                  </p>
                )}
              </div>
              <details className="portfolio-flow-table">
                <summary>Tatsächliche Zahlungsströme nach Steuern anzeigen</summary>
                <p className="vnote">
                  Diese Tabelle zeigt tatsächliche Geldflüsse nach Steuern, nicht die
                  Rendite-Zahlungsströme: TTWROR verwendet Zuflüsse vor Steuern, XIRR seine eigene
                  Zahlungsstrombasis nach Portfolio Performance. Tagesanfang enthält auch negative
                  Rückflüsse; Tagesende zeigt Entnahmen als positive Abflüsse. Die Werte sind je Tag
                  zusammengefasst, keine Liste einzelner Bankbuchungen.
                </p>
                {flows.length === 0 ? (
                  <p className="vnote">Keine Zahlungsströme im gewählten Zeitraum.</p>
                ) : (
                  <table className="portfolio-metrics-table">
                    <caption>Tatsächliche Geldflüsse nach Steuern im gewählten Zeitraum</caption>
                    <thead>
                      <tr>
                        <th scope="col">Datum</th>
                        <th scope="col">Tagesanfang</th>
                        <th scope="col">Tagesende</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flows.map((row) => (
                        <tr key={row.date}>
                          <th scope="row">{longDay(row.date)}</th>
                          <td>{eur(row.depositsCents, { sign: true })}</td>
                          <td>{eur(row.withdrawalsCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </details>
            </div>
          ) : (
            <p className="vnote" role="status">
              Keine vollständige Renditehistorie im gewählten Zeitraum. Nicht verfügbare Renditen
              werden nicht als null angenommen.
            </p>
          )}
          <PortfolioCalculationDisclosure
            summary={summary}
            incomplete={query.data?.incomplete}
            sourceId={sourceId}
          />
          <AppLink className="vlook" to="/reports/prendite" search={{ zeitraum: period }}>
            Portfolio-Auswertung öffnen
          </AppLink>
        </>
      )}
    </section>
  );
}
function Metric({ label, value }: { label: ReactNode; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
