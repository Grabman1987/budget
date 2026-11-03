import { useQuery } from '@tanstack/react-query';
import { addDays, monthEnds, sameDayMonthsBack } from '@budget/domain';
import { useAmountPrivacy } from '@budget/ui';
import { occurrencesQuery } from '../expected/api';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { longDay } from '../ledger/format';
import { AppLink } from '../shell/app-link';
import { sourceMoney } from '../wealth/trade-api';
import { PortfolioMonthBars } from '../charts/portfolio-month-bars';

/** Scheduled capital-income promises only; never extrapolate trades or calculate withholding. */
export function PortfolioExpectedIncome({ asOf }: { asOf: string }) {
  useAmountPrivacy();
  const to = sameDayMonthsBack(asOf, -12);
  const query = useQuery(occurrencesQuery(addDays(asOf, 1), to));
  const rows = query.isSuccess
    ? query.data.filter(
        (row) =>
          row.kind === 'inflow' &&
          row.incomeTypeId === 'income-capital' &&
          row.status === 'expected' &&
          row.bookingId === null &&
          row.dueDate > asOf &&
          row.dueDate <= to,
      )
    : [];
  const currencies = [...new Set(rows.map((row) => row.currency).filter(Boolean))].sort();
  return (
    <section className="prep-card" aria-labelledby="portfolio-expected-title">
      <h2 id="portfolio-expected-title">Erwartet · nächste 12 Monate</h2>
      <p className="vnote">
        {longDay(addDays(asOf, 1))} bis {longDay(to)} · gespeicherte Zahlungstermine der
        Einnahmenart Kapitalerträge. Keine Fortschreibung vergangener Trades und keine zugesicherte
        Rendite.
      </p>
      {query.isPending && <LoadingNote what="Geplante Kapitalerträge" />}
      {query.isError && (
        <ErrorNote
          what="Geplante Kapitalerträge"
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.isSuccess && (
        <>
          {rows.length === 0 && (
            <p role="status">
              Keine offenen geplanten Kapitalerträge in diesem Zeitraum. Dies ist keine Prognose von
              null Erträgen.
            </p>
          )}
          {rows.some((row) => !row.currency) && (
            <p role="status">
              Für einzelne Planwerte fehlt die Währung. Sie werden nicht summiert.
            </p>
          )}
          {currencies.map((currency) => {
            const source = rows.filter((row) => row.currency === currency);
            const months = monthEnds(asOf, to).map(({ month }) => ({
              month,
              values: [
                source
                  .filter((row) => row.dueDate.slice(0, 7) === month)
                  .reduce((sum, row) => sum + row.amountCents, 0),
              ],
            }));
            const total = source.reduce((sum, row) => sum + row.amountCents, 0);
            if (![total, ...months.flatMap((row) => row.values)].every(Number.isSafeInteger))
              return (
                <p role="status" key={currency}>
                  Plansumme in {currency} nicht darstellbar; einzelne Zahlungstermine bleiben im
                  Plan verfügbar.
                </p>
              );
            return (
              <div key={currency}>
                <p
                  className="portfolio-expected-total"
                  data-testid={`portfolio-expected-total-${currency}`}
                >
                  Geplant · {sourceMoney(total, currency)}
                </p>
                <PortfolioMonthBars
                  currency={currency}
                  rows={months}
                  names={['Geplante Kapitalerträge']}
                  future
                  testId={`portfolio-expected-chart-${currency}`}
                />
                <details>
                  <summary>Geplante Zahlungstermine · {currency}</summary>
                  <div
                    className="rscroll"
                    role="region"
                    aria-label={`Geplante Kapitalerträge ${currency}`}
                    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users scroll the full source table.
                    tabIndex={0}
                  >
                    <table className="rtable" data-testid={`portfolio-expected-table-${currency}`}>
                      <thead>
                        <tr>
                          <th scope="col">Fällig</th>
                          <th scope="col">Zahlung</th>
                          <th scope="col">Geplant · {currency}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {source.map((row) => (
                          <tr key={row.occurrenceId}>
                            <th scope="row">{longDay(row.dueDate)}</th>
                            <td>
                              <AppLink to={`/plan/erwartet/${encodeURIComponent(row.paymentId)}`}>
                                {row.name}
                              </AppLink>
                            </td>
                            <td className="n">{sourceMoney(row.amountCents, currency)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            );
          })}
        </>
      )}
      <details>
        <summary>Annahmen der Planung</summary>
        <p className="vnote">
          Betragsversionen, Rhythmus, Pausen, Verschiebungen und Enddatum stammen aus den
          gespeicherten erwarteten Zahlungen. Bereits gebuchte und gestrichene Termine sind
          ausgeschlossen. Beträge entsprechen den hinterlegten Planwerten; Brutto/Netto wird nicht
          angenommen, Steuern werden nicht neu berechnet. Teilmonate an beiden Grenzen, getrennte
          Währungen ohne Umrechnung. Gehalt und andere Haushaltseinnahmen sind ausgeschlossen.
        </p>
      </details>
      <AppLink to="/plan/erwartet">Geplante Zahlungen öffnen</AppLink>
    </section>
  );
}
