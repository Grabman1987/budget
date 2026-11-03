import { useQuery } from '@tanstack/react-query';
import { incomeByKindLast12Months, incomeLast12Months, monthEnds } from '@budget/domain';
import { Button, useAmountPrivacy } from '@budget/ui';
import type { TradeRow } from '@budget/db';
import { request, queryString } from '../api/http';
import { accountsQuery, LEDGER_KEY } from '../ledger/queries';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { longDay } from '../ledger/format';
import { PortfolioMonthBars } from '../charts/portfolio-month-bars';
import { PortfolioExpectedIncome } from './portfolio-expected-income';
import { instrumentsQuery } from '../wealth/portfolio-api';
import { sourceMoney } from '../wealth/trade-api';
import { AppLink } from '../shell/app-link';

/** Raw source-currency income detail. Shared income functions aggregate; no tax/FX/forecast is inferred. */
export function PortfolioIncomeDepth({ from, to }: { from: string; to: string }) {
  useAmountPrivacy();
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'wealth-activities', from, to],
    retry: false,
    queryFn: () =>
      request<{ trades: TradeRow[] }>('GET', `/api/trades${queryString({ from, to })}`),
  });
  const accounts = useQuery(accountsQuery());
  const instruments = useQuery(instrumentsQuery());
  const currencyOf = (row: TradeRow) =>
    accounts.data?.accounts.find((account) => account.id === row.accountId)?.currency;
  const rows =
    query.data?.trades.filter(
      (row) =>
        (row.kind === 'dividend' || row.kind === 'interest') && row.date > from && row.date <= to,
    ) ?? [];
  const currencies = [
    ...new Set(rows.flatMap((row) => (currencyOf(row) ? [currencyOf(row)!] : []))),
  ].sort();
  const ready = query.isSuccess && accounts.isSuccess && instruments.isSuccess;
  return (
    <div className="portfolio-income-depth">
      <p className="vnote">
        Dividenden und Zinsen aus gespeicherten Trades · {longDay(from)} bis {longDay(to)} · je
        Kontowährung. Diese Kapitalerträge sind keine Haushaltseinnahmen. Die EUR-Gesamtauswertung
        einschließlich ihrer Bewertung bleibt unter Gebühren und Steuern verfügbar.
      </p>
      {[
        { query, what: 'Erhaltene Erträge' },
        { query: accounts, what: 'Kontowährungen' },
        { query: instruments, what: 'Produkte' },
      ].map(({ query: source, what }) => (
        <div key={what}>
          {source.isPending && <LoadingNote what={what} />}
          {source.isError && (
            <ErrorNote what={what} error={source.error} onRetry={() => void source.refetch()} />
          )}
        </div>
      ))}
      {ready && rows.length === 0 && (
        <EmptyNote>Keine gespeicherten Erträge aus Trades in diesem Zeitraum.</EmptyNote>
      )}
      {ready && rows.some((row) => !currencyOf(row)) && (
        <p role="status">Für einzelne Erträge fehlt die Kontowährung. Sie werden nicht summiert.</p>
      )}
      {ready && (
        <>
          <div className="portfolio-income-columns">
            <div>
              {currencies.map((currency) => (
                <IncomeMonths
                  key={currency}
                  currency={currency}
                  from={from}
                  to={to}
                  trades={rows.filter((row) => currencyOf(row) === currency)}
                />
              ))}
              <PortfolioExpectedIncome asOf={to} />
            </div>
            <section className="prep-card" aria-labelledby="income-recent-title">
              <h2 id="income-recent-title">Zuletzt erhalten</h2>
              <div
                className="rscroll"
                role="region"
                aria-label="Erhaltene Erträge nach Produkt"
                // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users can scroll the full source table.
                tabIndex={0}
              >
                <table className="rtable" data-testid="portfolio-income-recent">
                  <thead>
                    <tr>
                      <th scope="col">Datum / Produkt</th>
                      <th scope="col">Art</th>
                      <th scope="col" className="n">
                        Brutto
                      </th>
                      <th scope="col" className="n">
                        Steuer
                      </th>
                      <th scope="col" className="n">
                        Gebühr
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...rows]
                      .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id))
                      .map((row) => {
                        const currency = currencyOf(row);
                        const money = (amount: number) =>
                          currency ? sourceMoney(amount, currency) : 'Währung fehlt';
                        return (
                          <tr key={row.id}>
                            <th scope="row">
                              {longDay(row.date)}
                              <br />
                              <AppLink
                                to={`/vermoegen/portfolio/instrument/${encodeURIComponent(row.securityId)}`}
                                search={(previous: Record<string, unknown>) => ({
                                  ...previous,
                                  handel: row.id,
                                })}
                              >
                                {instruments.data?.securities.find(
                                  (security) => security.id === row.securityId,
                                )?.name ?? row.securityId}
                              </AppLink>
                            </th>
                            <td>{row.kind === 'dividend' ? 'Dividende' : 'Zinsen'}</td>
                            <td className="n">{money(row.amountCents)}</td>
                            <td className="n">{money(row.taxCents)}</td>
                            <td className="n">{money(row.feeCents)}</td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

function IncomeMonths({
  currency,
  from,
  to,
  trades,
}: {
  currency: string;
  from: string;
  to: string;
  trades: TradeRow[];
}) {
  useAmountPrivacy();
  const rows = monthEnds(from, to).map(({ month }) => {
    const source = trades.filter((row) => row.date.slice(0, 7) === month);
    return {
      month,
      byKind: incomeByKindLast12Months(source, to),
      income: incomeLast12Months(source, to),
    };
  });
  if (
    rows.some((row) =>
      [
        ...Object.values(row.income),
        ...Object.values(row.byKind.dividend),
        ...Object.values(row.byKind.interest),
      ].some((value) => !Number.isSafeInteger(value)),
    )
  ) {
    return (
      <section className="prep-card">
        <h2>Erhalten pro Monat · {currency}</h2>
        <p role="status">
          Die Ertragssumme überschreitet den darstellbaren Bereich. Einzelne Quellzahlungen bleiben
          unter „Zuletzt erhalten“ verfügbar.
        </p>
      </section>
    );
  }
  const columns = ['Monat', 'Dividenden brutto', 'Zinsen brutto', 'Steuer', 'Gebühr', 'Ausbezahlt'];
  const display = rows.map((row) => [
    row.month,
    ...[
      row.byKind.dividend.grossCents,
      row.byKind.interest.grossCents,
      row.income.taxCents,
      row.income.feeCents,
      row.income.netCents,
    ].map((amount) => sourceMoney(amount, currency)),
  ]);
  const download = () => {
    const csv = [columns, ...display]
      .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(';'))
      .join('\r\n');
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
    link.download = `kapitalertraege-${currency}-${from}-${to}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 2000);
  };
  return (
    <section className="prep-card" aria-label={`Erhalten pro Monat · ${currency}`}>
      <div className="tbd-head">
        <h2>Erhalten pro Monat · {currency}</h2>
        <Button variant="ghost" onClick={download}>
          CSV · {currency}
        </Button>
      </div>
      <PortfolioMonthBars
        currency={currency}
        rows={rows.map((row) => ({
          month: row.month,
          values: [row.byKind.dividend.grossCents, row.byKind.interest.grossCents],
        }))}
        names={['Dividenden', 'Zinsen']}
        testId={`portfolio-income-chart-${currency}`}
      />
      <details>
        <summary>Monatswerte als Tabelle · {currency}</summary>
        <div
          className="rscroll"
          role="region"
          aria-label={`Ertragstabelle ${currency}`}
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users can scroll all monthly columns.
          tabIndex={0}
        >
          <table className="rtable" data-testid={`portfolio-income-table-${currency}`}>
            <thead>
              <tr>
                {columns.map((label) => (
                  <th key={label} scope="col">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {display.map((row) => (
                <tr key={row[0]}>
                  {row.map((cell, index) =>
                    index === 0 ? (
                      <th scope="row" key={index}>
                        {cell}
                      </th>
                    ) : (
                      <td className="n" key={index}>
                        {cell}
                      </td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="vnote">
        Brutto, einbehaltene Steuern und Gebühren sind gespeichert. Ausbezahlt = Brutto minus diese
        Steuern und Gebühren; TER ist bereits im Kurs enthalten und wird hier nicht nochmals
        abgezogen. Teilmonate an beiden Zeitraumgrenzen; keine Währungsumrechnung.
      </p>
    </section>
  );
}
