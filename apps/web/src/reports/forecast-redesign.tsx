import type { LiquidityHorizon, LiquidityReport } from '@budget/domain';
import { useAmountPrivacy } from '@budget/ui';
import { ArrowDown, Info } from 'lucide-react';
import type { ReactNode } from 'react';
import { eur, longDay } from '../ledger/format';
import { useIsPhone } from '../budget/month-span';
import { AppLink } from '../shell/app-link';
import type { LiquidityReportView } from './liquidity-api';
import { LiquidityChart } from './liquidity-chart';
import { upcomingEvents } from './liquidity-selection';
import { ReportTable } from './report-table';

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
  const phone = useIsPhone();
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
            Tiefpunkt{' '}
            <Info
              size={15}
              aria-label="Kleinster Kontostand aller Budget-Konten im gewählten Zeitraum, inklusive erwarteter Eingänge"
            />
          </span>
          <strong data-testid="liq-low">{low ? eur(low.cents) : 'nicht verfügbar'}</strong>
        </div>
        <span>{low ? 'am ' + longDay(low.day) : 'Keine Prognosepunkte verfügbar'}</span>
        <small>Alle Budget-Konten, mit erwarteten Eingängen</small>
      </div>
      <section className="forecast-reference-chart" aria-labelledby="liq-title">
        <div className="forecast-reference-chart-head">
          <h2 id="liq-title">Kontostand Budget-Konten</h2>
          <ul className="rf-legend" aria-label="Legende" data-testid="liq-legend">
            <li>{forecastLabel}</li>
            <li>10 % Puffer</li>
          </ul>
        </div>
        <LiquidityChart report={report} salaryDay={salaryDate} compact />
      </section>
      <div className="forecast-reference-table-wrap" data-testid="liq-next-events">
        <h3 id="liq-next" className="sr-only">
          Nächste Buchungsereignisse
        </h3>
        {phone ? (
          <ul className="forecast-reference-list" aria-label="Nächste Buchungsereignisse">
            {rows.map((row, index) => {
              const point = points.get(row.day);
              const atLow = low?.day === row.day;
              return (
                <li
                  key={row.day + '-' + index}
                  className={atLow ? 'is-low' : undefined}
                  data-testid="liq-next-event"
                  data-cents={row.cents}
                >
                  <span className="forecast-reference-list-what">
                    {row.label}
                    {atLow && (
                      <span className="forecast-low-pill">
                        <ArrowDown size={13} aria-hidden="true" />
                        Tiefpunkt
                      </span>
                    )}
                  </span>
                  <strong data-testid="liq-event-amount">{eur(row.cents)}</strong>
                  <small>
                    <time dateTime={row.day}>{longDay(row.day)}</time>
                    {point ? ` · Kontostand ${eur(point.balanceCents)}` : ''}
                  </small>
                </li>
              );
            })}
          </ul>
        ) : (
          <ReportTable
            caption="Nächste Buchungsereignisse mit dem kanonischen Tagesendstand"
            regionLabel="Zahlungen und Kontostände, seitlich scrollbar"
            className="forecast-reference-table"
          >
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
                    <td data-testid="liq-event-amount">{eur(row.cents)}</td>
                    <td>{point ? eur(point.balanceCents) : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </ReportTable>
        )}
        {rows.length === 0 && (
          <p className="forecast-reference-empty">
            Im Prognosezeitraum stehen keine größeren Buchungen an.
          </p>
        )}
      </div>
      <p className="plan-v2-source">
        Stand {longDay(view.asOf)} · Budget-Konten · Tagesendstände
        {phone && (
          <>
            {' '}
            · Start <span data-testid="liq-start">{eur(report.startCents)}</span>
          </>
        )}
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
        <p>Einzelkonto:</p>
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
