import { BenchmarkChoices } from './portfolio-benchmark-settings';
import { Term } from '../reports/term';
import { useAmountPrivacy, ChartValues } from '@budget/ui';
import type { PortfolioPerformanceHistory, PortfolioSummary } from '@budget/db';
import { heatForCell, type BenchmarkGap } from '@budget/domain';
import type { CSSProperties, ReactNode } from 'react';
import { eur, shortDay } from '../ledger/format';
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
  const perf = summary.performance;
  const heatMax = Math.max(1e-9, ...history.months.map((m) => Math.abs(m.rate ?? 0)));
  return (
    <>
      <section aria-labelledby="performance-benchmark-title">
        <div className="tbd-head">
          <h2 id="performance-benchmark-title">
            Portfolio und <Term>Benchmark</Term>
          </h2>
        </div>
        <BenchmarkChoices />
        <dl className="performance-metrics">
          {summary.benchmarks.map((b) => (
            <div key={b.id} className="performance-metric">
              <dt>{b.name}</dt>
              <dd data-testid="benchmark-return">{rateText(b.benchmarkReturn)}</dd>
              <dt>
                Differenz <Term>TTWROR</Term> · <Term>Beta</Term>
              </dt>
              <dd>
                {ppText(
                  b.benchmarkReturn === null || !perf ? null : perf.ttwror - b.benchmarkReturn,
                )}{' '}
                · {decimal(b.beta)}
              </dd>
            </div>
          ))}
          <div className="performance-metric">
            <dt>
              <Term>Volatilität</Term> p. a.
            </dt>
            <dd>{percentText(perf?.volatility)}</dd>
          </div>
          <div className="performance-metric">
            <dt>
              <Term>Max. Rückgang</Term>
            </dt>
            <dd>{rateText(perf?.maxDrawdown)}</dd>
          </div>
          <div className="performance-metric">
            <dt>
              <Term>Sharpe</Term> · sicherer Zins 2,5 %
            </dt>
            <dd>{perf && perf.volatility >= 0.005 ? decimal(perf.sharpe) : '–'}</dd>
          </div>
        </dl>
        {summary.benchmarks.some((b) => b.benchmarkReturn === null) && (
          <p role="status" className="vnote">
            Kurslücken: Die betroffene Benchmark-Rendite und Beta sind nicht verfügbar.
          </p>
        )}
        <PerformanceChart
          label="Portfolio und Benchmark, indexiert auf 100"
          rows={history.index}
          lines={[
            { name: 'Portfolio', values: history.index.map((p) => p.portfolio) },
            ...summary.benchmarks.map((b) => ({
              name: b.name,
              values: b.index.map((p) => p.benchmark),
              benchmark: true,
            })),
          ]}
        />
        <details>
          <summary>Verlauf als Tabelle</summary>
          <Scroll label="Indexwerte">
            <table className="prep-table">
              <caption>Indexwerte · Start = 100</caption>
              <thead>
                <tr>
                  <th scope="col">Datum</th>
                  <th scope="col">Portfolio</th>
                  {summary.benchmarks.map((b) => (
                    <th scope="col" key={b.id}>
                      {b.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.index.map((p, i) => (
                  <tr key={p.date}>
                    <th scope="row">{shortDay(p.date)}</th>
                    <td>{decimal(p.portfolio)}</td>
                    {summary.benchmarks.map((b) => (
                      <td key={b.id}>{decimal(b.index[i]?.benchmark)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
        </details>
        <p className="vnote">
          Gleicher Zeitraum, Start = 100. EUR-Schlusskurse von Index-ETF, ohne zusätzliche
          Ausschüttungen. Am Wochenende zählt der gespeicherte Freitagskurs; Kurslücken bleiben
          sichtbar.
        </p>
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
                  ...summary.benchmarks.map((b) => `gegen ${b.name}`),
                  'Volatilität p. a.',
                  'Max. Rückgang',
                  'Sharpe',
                ].map((label) => (
                  <th scope="col" key={label}>
                    <Term>{label}</Term>
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
                  {summary.benchmarks.map((b) => (
                    <td className="n" key={b.id}>
                      {ppText(
                        b.benchmarkReturn === null || !c.performance
                          ? null
                          : c.performance.ttwror - b.benchmarkReturn,
                      )}
                    </td>
                  ))}
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
        <ChartValues
          label="Monatsrenditen"
          points={history.years.flatMap((year) =>
            MONTHS.map((_, i) => {
              const month = `${year.year}-${String(i + 1).padStart(2, '0')}`;
              const cell = history.months.find((m) => m.month === month);
              return {
                x: 50,
                date: month,
                series: [
                  {
                    name: 'Portfolio',
                    value: percentText(cell?.rate, { digits: 2 }),
                    color: (cell?.rate ?? 0) < 0 ? 'var(--red)' : 'var(--line)',
                  },
                ],
              };
            }),
          )}
        >
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
                  {summary.benchmarks.map((b) => (
                    <th scope="col" key={b.id}>
                      {b.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {history.years.map((year, yearIndex) => (
                  <tr key={year.year}>
                    <th scope="row">{year.year}</th>
                    {MONTHS.map((_, i) => {
                      const month = `${year.year}-${String(i + 1).padStart(2, '0')}`;
                      const cell = history.months.find((m) => m.month === month);
                      const heat = heatForCell(
                        cell?.rate ?? null,
                        { mean: 0, dev: heatMax },
                        'high',
                      );
                      return (
                        <td
                          key={month}
                          data-chart-point={yearIndex * 12 + i}
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
                    {summary.benchmarks.map((b) => (
                      <td className="n" key={b.id}>
                        {rateText(b.years.find((y) => y.year === year.year)?.benchmarkRate)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Scroll>
        </ChartValues>
        <p className="vnote">
          Grün mit + = Gewinn, Rot mit − = Verlust. Jahreswerte verketten die angezeigten
          Monatsrenditen. „–“ = außerhalb des Zeitraums; „Nicht verfügbar“ = ohne bewertbares
          Kapital. * kennzeichnet den tatsächlichen Teilzeitraum.
        </p>
        <details>
          <summary>Monatsrenditen als einfache Tabelle</summary>
          <MonthlyTable history={history} benchmarks={summary.benchmarks} />
        </details>
      </section>
    </>
  );
}

function MonthlyTable({
  history,
  benchmarks,
}: {
  history: PortfolioPerformanceHistory;
  benchmarks: PortfolioSummary['benchmarks'];
}) {
  useAmountPrivacy();
  return (
    <Scroll label="Monatsrenditen mit Kursnachweis">
      <table className="prep-table">
        <caption>Renditen und gespeicherte Benchmark-Kursdaten</caption>
        <thead>
          <tr>
            {[
              'Monat',
              'Von (Schlusswert)',
              'Bis',
              'Portfolio',
              ...benchmarks.map((b) => b.name),
            ].map((t) => (
              <th scope="col" key={t}>
                {t}
              </th>
            ))}
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
              {benchmarks.map((b) => {
                const row = b.months.find((r) => r.month === m.month);
                return (
                  <td key={b.id}>
                    {row?.benchmarkGap ? gapText(row.benchmarkGap) : rateText(row?.benchmarkRate)}
                  </td>
                );
              })}
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
