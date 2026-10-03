import { useAmountPrivacy } from '@budget/ui';
import type { PortfolioPerformanceHistory, PortfolioSummary } from '@budget/db';
import { heatForCell, type BenchmarkGap } from '@budget/domain';
import type { CSSProperties, ReactNode } from 'react';
import { eur, shortDay } from '../ledger/format';
import { AppLink } from '../shell/app-link';
import { percentText, ppText } from './portfolio-report-shared';
import { PerformanceChart, performanceDecimal as decimal } from './performance-chart';

const rateText = (value: number | null | undefined) => percentText(value, { sign: true });
const gapText = (gap: BenchmarkGap | null) =>
  gap === 'missing_fx'
    ? 'Wechselkurs fehlt'
    : gap === 'missing_price'
      ? 'Kurslücke'
      : gap === 'not_selected'
        ? 'Keine Benchmark gewählt'
        : '';
const MONTHS = ['Jän', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];

export function PerformanceComparisons({ summary }: { summary: PortfolioSummary }) {
  useAmountPrivacy();
  const history = summary.performanceHistory;
  if (!history) return null;
  const benchmark = history.benchmarkReturn;
  const perf = summary.performance;
  const heatMax = Math.max(1e-9, ...history.months.map((m) => Math.abs(m.rate ?? 0)));
  return (
    <>
      <section aria-labelledby="performance-benchmark-title">
        <div className="tbd-head">
          <h2 id="performance-benchmark-title">Portfolio und Benchmark</h2>
          <AppLink to="/einstellungen/depots" className="prep-decision">
            Benchmark einstellen
          </AppLink>
        </div>
        <dl className="performance-metrics">
          <div className="performance-metric">
            <dt>{summary.benchmark?.name ?? 'Benchmark'}</dt>
            <dd data-testid="benchmark-return">{rateText(benchmark)}</dd>
          </div>
          <div className="performance-metric">
            <dt>Differenz TTWROR</dt>
            <dd>{ppText(benchmark === null || !perf ? null : perf.ttwror - benchmark)}</dd>
          </div>
          <div className="performance-metric">
            <dt>Beta gegen Benchmark</dt>
            <dd>{decimal(perf?.beta)}</dd>
          </div>
          <div className="performance-metric">
            <dt>Volatilität p. a.</dt>
            <dd>{percentText(perf?.volatility)}</dd>
          </div>
          <div className="performance-metric">
            <dt>Max. Rückgang</dt>
            <dd>{rateText(perf?.maxDrawdown)}</dd>
          </div>
          <div className="performance-metric">
            <dt>Sharpe · sicherer Zins 2,5 %</dt>
            <dd>{perf && perf.volatility >= 0.005 ? decimal(perf.sharpe) : '–'}</dd>
          </div>
        </dl>
        {history.months.some((m) => m.benchmarkGap !== null) && (
          <p role="status" className="vnote">
            {summary.benchmark
              ? 'Die Benchmark hat Kurs- oder Wechselkurslücken. Gesamtrendite, Differenz und Beta sind nicht verfügbar.'
              : 'Keine Benchmark gewählt. Bitte in den Einstellungen ein Wertpapier auswählen.'}
          </p>
        )}
        <PerformanceChart
          label="Portfolio und Benchmark, indexiert auf 100"
          rows={history.index}
          lines={[
            { name: 'Portfolio', values: history.index.map((p) => p.portfolio) },
            {
              name: summary.benchmark?.name ?? 'Benchmark',
              values: history.index.map((p) => p.benchmark),
              benchmark: true,
            },
          ]}
        />
        <p className="vnote">
          Gleicher Zeitraum, Start = 100. Benchmark: gespeicherte Kurse in Euro mit dem Wechselkurs
          des Kursdatums, ohne zusätzliche Ausschüttungen. Bei börsengehandelten Wertpapieren zählt
          am Wochenende der gespeicherte Freitagskurs; bei Krypto und manuellen Anlagen braucht es
          das genaue Kursdatum. Fehlende Abschlüsse bleiben eine Lücke.
        </p>
        <details>
          <summary>Verlauf als Tabelle</summary>
          <Scroll label="Indexwerte">
            <table className="prep-table">
              <caption>Indexwerte · Start = 100</caption>
              <thead>
                <tr>
                  <th scope="col">Datum</th>
                  <th scope="col">Portfolio</th>
                  <th scope="col">Benchmark</th>
                </tr>
              </thead>
              <tbody>
                {history.index.map((p) => (
                  <tr key={p.date}>
                    <th scope="row">{shortDay(p.date)}</th>
                    <td className="n">{decimal(p.portfolio)}</td>
                    <td className="n">
                      {p.benchmark === null ? 'Nicht verfügbar' : decimal(p.benchmark)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
        </details>
      </section>
      <section aria-labelledby="performance-classes-title">
        <div className="tbd-head">
          <h2 id="performance-classes-title">Anlageklassen nebeneinander</h2>
        </div>
        <PerformanceChart
          label="Anlageklassen indexiert auf 100"
          rows={history.index}
          lines={history.classes.map((c) => ({
            name: c.name,
            values: c.index.map((p) => p.portfolio),
          }))}
        />
        <Scroll label="Kennzahlen der Anlageklassen">
          <table className="prep-table">
            <caption>Kennzahlen im gewählten Zeitraum</caption>
            <thead>
              <tr>
                {[
                  'Anlageklasse',
                  'Wert am Ende',
                  'TTWROR',
                  'Geldgewichtet',
                  'gegen Benchmark',
                  'Volatilität p. a.',
                  'Max. Rückgang',
                  'Sharpe',
                ].map((label) => (
                  <th scope="col" key={label}>
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {history.classes.map((c) => (
                <tr key={c.assetClassId ?? 'none'}>
                  <th scope="row">{c.name}</th>
                  <td className="n">{eur(c.valueCents)}</td>
                  <td className="n">{rateText(c.performance?.ttwror)}</td>
                  <td className="n">{rateText(c.performance?.moneyWeighted)}</td>
                  <td className="n">
                    {ppText(
                      benchmark === null || !c.performance
                        ? null
                        : c.performance.ttwror - benchmark,
                    )}
                  </td>
                  <td className="n">{percentText(c.performance?.volatility)}</td>
                  <td className="n">{rateText(c.performance?.maxDrawdown)}</td>
                  <td className="n">
                    {c.performance && c.performance.volatility >= 0.005
                      ? decimal(c.performance.sharpe)
                      : '–'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroll>
        <p className="vnote">
          Aktuelle Zuordnung aus Einstellungen › Anlageklassen, einschließlich verkaufter
          Positionen. Ohne eingesetztes Kapital bleibt die Rendite nicht verfügbar. Geldgewichtet:
          Modified Dietz, über 365 Tage annualisiert. Sharpe unter 0,5 % Volatilität wird
          ausgelassen.
        </p>
      </section>
      <section aria-labelledby="performance-heatmap-title">
        <div className="tbd-head">
          <h2 id="performance-heatmap-title">Monatsrenditen, Monat × Jahr</h2>
        </div>
        <Scroll label="Monatsrenditen">
          <table className="prep-table performance-heatmap">
            <caption>Portfolio-TTWROR in Prozent · * Teilmonat oder Teiljahr</caption>
            <thead>
              <tr>
                <th scope="col">Jahr</th>
                {MONTHS.map((m) => (
                  <th scope="col" key={m}>
                    {m}
                  </th>
                ))}
                <th scope="col">Jahr</th>
                <th scope="col">Benchmark</th>
              </tr>
            </thead>
            <tbody>
              {history.years.map((year) => (
                <tr key={year.year}>
                  <th scope="row">{year.year}</th>
                  {MONTHS.map((_, i) => {
                    const month = `${year.year}-${String(i + 1).padStart(2, '0')}`;
                    const cell = history.months.find((m) => m.month === month);
                    const heat = heatForCell(cell?.rate ?? null, { mean: 0, dev: heatMax }, 'high');
                    return (
                      <td
                        key={month}
                        style={heat ? ({ '--h': heat.strength } as CSSProperties) : undefined}
                        className={
                          heat
                            ? `n ${heat.tone === 'good' ? 'return-positive' : 'return-negative'}`
                            : 'n'
                        }
                        title={
                          cell
                            ? `${shortDay(cell.from)} bis ${shortDay(cell.to)}`
                            : 'Außerhalb des Zeitraums'
                        }
                      >
                        {cell
                          ? cell.rate === null
                            ? 'Nicht verfügbar'
                            : `${rateText(cell.rate)}${cell.partial ? ' *' : ''}`
                          : '–'}
                      </td>
                    );
                  })}
                  <td className="n">
                    <strong>
                      {rateText(year.rate)}
                      {year.partial ? ' *' : ''}
                    </strong>
                  </td>
                  <td className="n">{rateText(year.benchmarkRate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Scroll>
        <p className="vnote">
          Grün mit + = Gewinn, Rot mit − = Verlust. Jahreswerte verketten die angezeigten
          Monatsrenditen. „–“ = außerhalb des Zeitraums; „Nicht verfügbar“ = ohne bewertbares
          Kapital. * kennzeichnet den tatsächlichen Teilzeitraum.
        </p>
        <details>
          <summary>Monatsrenditen als einfache Tabelle</summary>
          <MonthlyTable history={history} />
        </details>
      </section>
    </>
  );
}

function MonthlyTable({ history }: { history: PortfolioPerformanceHistory }) {
  useAmountPrivacy();
  return (
    <Scroll label="Monatsrenditen mit Kursnachweis">
      <table className="prep-table">
        <caption>Renditen und gespeicherte Benchmark-Kursdaten</caption>
        <thead>
          <tr>
            {['Monat', 'Von (Schlusswert)', 'Bis', 'Portfolio', 'Benchmark', 'Kursnachweis'].map(
              (t) => (
                <th scope="col" key={t}>
                  {t}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {history.months.map((m) => (
            <tr key={m.month}>
              <th scope="row">
                {m.month}
                {m.partial ? ' (Teilmonat)' : ''}
              </th>
              <td>{shortDay(m.from)}</td>
              <td>{shortDay(m.to)}</td>
              <td className="n">{m.rate === null ? 'Nicht verfügbar' : rateText(m.rate)}</td>
              <td>{m.benchmarkGap ? gapText(m.benchmarkGap) : rateText(m.benchmarkRate)}</td>
              <td>
                {m.startQuoteDate ? shortDay(m.startQuoteDate) : 'Fehlt'} →{' '}
                {m.endQuoteDate ? shortDay(m.endQuoteDate) : 'Fehlt'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Scroll>
  );
}

function Scroll({ label, children }: { label: string; children: ReactNode }) {
  useAmountPrivacy();
  return (
    <div
      className="prep-scroll"
      role="region"
      aria-label={label}
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard scrolling for wide tables.
      tabIndex={0}
    >
      {children}
    </div>
  );
}
