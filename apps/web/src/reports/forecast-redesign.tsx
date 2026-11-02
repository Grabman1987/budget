import type { LiquidityHorizon, LiquidityReport } from '@budget/domain';
import { useAmountPrivacy } from '@budget/ui';
import { ArrowDown, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { eur, longDay } from '../ledger/format';
import { AppLink } from '../shell/app-link';
import type { LiquidityReportView } from './liquidity-api';
import { LiquidityChart } from './liquidity-chart';
import { upcomingEvents } from './liquidity-selection';

/** The same T2 points and movements, arranged as the Plan design's lead/chart/table. */
export function ForecastRedesign({
  view,
  report,
  salaryDate,
  forecastLabel,
  horizon,
  levers,
  basis,
}: {
  view: LiquidityReportView;
  report: LiquidityReport;
  salaryDate: string | null;
  forecastLabel: string;
  horizon: LiquidityHorizon;
  levers: readonly string[];
  basis: ReactNode;
}) {
  useAmountPrivacy();
  const rows = upcomingEvents(report, 10);
  const points = new Map(report.points.map((point) => [point.day, point]));
  const low = report.low;
  return (
    <section
      className="forecast-reference"
      data-testid="liq-forecast-card"
      aria-label="Prognose im Plan"
    >
      <div className="forecast-reference-lead">
        <div>
          <span>
            Tiefpunkt <Info size={15} aria-label="Kleinster Kontostand im gewählten Zeitraum" />
          </span>
          <strong data-testid="liq-low">{low ? eur(low.cents) : 'nicht verfügbar'}</strong>
        </div>
        <span>{low ? 'am ' + longDay(low.day) : 'Keine Prognosepunkte verfügbar'}</span>
      </div>
      <section className="forecast-reference-chart" aria-labelledby="liq-title">
        <div className="forecast-reference-chart-head">
          <h2 id="liq-title">Kontostand Budget-Konten</h2>
          <ul className="rf-legend" aria-label="Legende" data-testid="liq-legend">
            <li>{forecastLabel}</li>
            <li>10 % Puffer</li>
            <li>ohne Ereignisse</li>
          </ul>
        </div>
        <LiquidityChart report={report} salaryDay={salaryDate} compact />
      </section>
      <div
        className="forecast-reference-table-wrap"
        data-testid="liq-next-events"
        role="region"
        aria-label="Zahlungen und Kontostände, seitlich scrollbar"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users can scroll the complete financial columns.
        tabIndex={0}
      >
        <h3 id="liq-next" className="sr-only">
          Nächste Buchungsereignisse
        </h3>
        <table className="forecast-reference-table">
          <caption className="sr-only">
            Nächste Buchungsereignisse mit dem kanonischen Tagesendstand
          </caption>
          <thead>
            <tr>
              <th scope="col">Datum</th>
              <th scope="col">Zahlung</th>
              <th scope="col">Betrag</th>
              <th scope="col" title="Tagesendstand einschließlich variabler Planung">
                Kontostand
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <time dateTime={report.startDay}>{longDay(report.startDay)}</time>
              </td>
              <td>Heute</td>
              <td>–</td>
              <td data-testid="liq-start">{eur(report.startCents)}</td>
            </tr>
            {rows.map((row, index) => {
              const point = points.get(row.day);
              const atLow = low?.day === row.day;
              return (
                <tr
                  key={row.day + '-' + index}
                  className={atLow ? 'is-low' : undefined}
                  data-testid="liq-next-event"
                  data-cents={row.cents}
                >
                  <td>
                    <time dateTime={row.day}>{longDay(row.day)}</time>
                  </td>
                  <td className="lq-what">
                    {row.label}
                    {atLow && (
                      <span className="forecast-low-pill">
                        <ArrowDown size={13} aria-hidden="true" />
                        Tiefpunkt
                      </span>
                    )}
                  </td>
                  <td>{eur(row.cents, { sign: true })}</td>
                  <td>{point ? eur(point.balanceCents) : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="forecast-reference-empty">
            Im Prognosezeitraum stehen keine größeren Buchungen an.
          </p>
        )}
      </div>
      <p className="plan-v2-source">
        Stand {longDay(view.asOf)} · Budget-Konten · Kontostand ist der jeweilige Tagesendstand,
        einschließlich variabler Planung.
      </p>
      <details className="forecast-reference-basis">
        <summary>Grundlage und Szenarien</summary>
        {basis}
        <dl>
          <div>
            <dt>Mit 10 % Puffer</dt>
            <dd data-testid="liq-low-buffer">
              {report.lowBuffer ? eur(report.lowBuffer.cents) : 'nicht verfügbar'}
            </dd>
          </div>
          <div>
            <dt>Ohne Ereignisse</dt>
            <dd data-testid="liq-low-plain">
              {report.lowPlain ? eur(report.lowPlain.cents) : 'nicht verfügbar'}
            </dd>
          </div>
        </dl>
        <p>
          Ein Überziehungsrahmen zählt nicht als Geld. Rücklagen auf Konten außerhalb des Budgets
          bleiben draußen.
        </p>
        <p>Einzelkontovorschau · gleicher Zeitraum und gleiche Stellschrauben:</p>
        <div className="kacct-actions">
          {view.budgetAccounts.map((account) => (
            <AppLink
              key={account.id}
              className="btn btn-ghost"
              to={'/konten/' + encodeURIComponent(account.id)}
              search={{ vorschau: 'liquiditaet', horizon, levers: levers.join(',') }}
            >
              {account.name}
            </AppLink>
          ))}
        </div>
      </details>
    </section>
  );
}
