import { useQuery } from '@tanstack/react-query';
import type { TradeRow } from '@budget/db';
import { useAmountPrivacy } from '@budget/ui';
import { request, queryString } from '../api/http';
import { accountsQuery, LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { longDay } from '../ledger/format';
import { sourceMoney } from '../wealth/trade-api';
import { PortfolioMonthBars } from '../charts/portfolio-month-bars';
import { recordedComponents } from './portfolio-recorded-components';

/** Recorded monthly fees and paid taxes, by source currency; TER remains in the canonical summary. */
export function PortfolioRecordedCostHistory({ from, to }: { from: string; to: string }) {
  useAmountPrivacy();
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'wealth-activities', from, to],
    retry: false,
    queryFn: () =>
      request<{ trades: TradeRow[] }>('GET', `/api/trades${queryString({ from, to })}`),
  });
  const accounts = useQuery(accountsQuery());
  const error = query.error ?? accounts.error;
  const ready = query.isSuccess && accounts.isSuccess;
  const source = query.data?.trades.filter((row) => row.date > from && row.date <= to) ?? [];
  const currencyOf = (row: TradeRow) =>
    accounts.data?.accounts.find((account) => account.id === row.accountId)?.currency;
  const currencies = [
    ...new Set(source.flatMap((row) => (currencyOf(row) ? [currencyOf(row)!] : []))),
  ].sort();
  return (
    <section
      className="prep-card portfolio-income-depth"
      aria-labelledby="portfolio-cost-history-title"
    >
      <h2 id="portfolio-cost-history-title">Kosten im Verlauf</h2>
      <p className="vnote">
        {longDay(from)} bis {longDay(to)} · tatsächlich gebuchte Gebühren und bezahlte Steuern aus
        Trades, je Kontowährung. Teilmonate an den Zeitraumgrenzen. TER ist bereits im Kurs
        enthalten und wird monatlich nicht geschätzt oder nochmals abgezogen.
      </p>
      {error ? (
        <ErrorNote
          what="Gebuchte Kosten im Verlauf"
          error={error}
          onRetry={() => void (query.isError ? query.refetch() : accounts.refetch())}
        />
      ) : (
        !ready && <LoadingNote what="Gebuchte Kosten im Verlauf" />
      )}
      {ready && source.length === 0 && (
        <p role="status">Keine gespeicherten Trades in diesem Zeitraum.</p>
      )}
      {ready && source.some((row) => !currencyOf(row)) && (
        <p role="status">
          Für einzelne Quellzahlungen fehlt die Kontowährung. Sie werden nicht summiert.
        </p>
      )}
      {ready &&
        currencies.map((currency) => {
          const rows = recordedComponents(
            source.filter((row) => currencyOf(row) === currency),
            from,
            to,
          );
          if (
            rows.some(
              (row) =>
                !Number.isSafeInteger(row.feesCents) || !Number.isSafeInteger(row.taxesCents),
            )
          )
            return (
              <p role="status" key={currency}>
                Monatssumme in {currency} nicht darstellbar.
              </p>
            );
          return (
            <div key={currency}>
              <h3>Gebuchte Kosten · {currency}</h3>
              <PortfolioMonthBars
                currency={currency}
                rows={rows.map((row) => ({
                  month: row.month,
                  values: [row.feesCents, row.taxesCents],
                }))}
                names={['Gebühren', 'Bezahlte Steuern']}
                testId={`portfolio-cost-history-${currency}`}
              />
              <details>
                <summary>Gebuchte Monatskosten als Tabelle · {currency}</summary>
                <div
                  className="rscroll"
                  role="region"
                  aria-label={`Gebuchte Monatskosten ${currency}`}
                  // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users scroll all cost columns.
                  tabIndex={0}
                >
                  <table
                    className="rtable"
                    data-testid={`portfolio-cost-history-table-${currency}`}
                  >
                    <thead>
                      <tr>
                        <th scope="col">Monat</th>
                        <th scope="col">Gebühren</th>
                        <th scope="col">Bezahlte Steuern</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row) => (
                        <tr key={row.month}>
                          <th scope="row">{row.month}</th>
                          <td>{sourceMoney(row.feesCents, currency)}</td>
                          <td>{sourceMoney(row.taxesCents, currency)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </div>
          );
        })}
    </section>
  );
}
