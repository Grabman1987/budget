import { useQuery } from '@tanstack/react-query';
import type { TradeRow } from '@budget/db';
import { fxOn, toEurCents, type RateTable } from '@budget/domain';
import { useAmountPrivacy } from '@budget/ui';
import { queryString, request } from '../api/http';
import { accountsQuery, LEDGER_KEY } from '../ledger/queries';
import { eur, longDay } from '../ledger/format';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { recordedComponents, recordedGainResidual } from './portfolio-recorded-components';

/** Existing trade and FX reads; no return, tax, cost-basis or TER method is recreated here. */
export function PortfolioGainComponents({
  from,
  to,
  gainCents,
}: {
  from: string;
  to: string;
  gainCents: number;
}) {
  useAmountPrivacy();
  const accounts = useQuery(accountsQuery());
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'portfolio-recorded-components', from, to, gainCents],
    retry: false,
    enabled: accounts.isSuccess,
    queryFn: async () => {
      const { trades } = await request<{ trades: TradeRow[] }>(
        'GET',
        `/api/trades${queryString({ from, to })}`,
      );
      const investmentAccounts = new Set(
        accounts.data!.accounts.filter((account) => account.role === 'investment').map((a) => a.id),
      );
      const source = trades.filter(
        (row) => row.date > from && row.date <= to && investmentAccounts.has(row.accountId),
      );
      const currencies = new Map(accounts.data!.accounts.map((a) => [a.id, a.currency]));
      if (source.some((row) => !currencies.has(row.accountId)))
        throw new Error('Für einzelne Zahlungen fehlt die Kontowährung.');
      const foreign = [...new Set(source.map((row) => currencies.get(row.accountId)!))].filter(
        (currency) => currency !== 'EUR',
      );
      // Include earlier quotes so the canonical latest-on-or-before rule can carry a rate.
      const rates: RateTable = new Map(
        await Promise.all(
          foreign.map(async (currency) => {
            const result = await request<{
              rates: { date: string; rateMicro: number }[];
            }>('GET', `/api/fx${queryString({ currency, to })}`);
            return [currency, result.rates] as const;
          }),
        ),
      );
      const converted = source.map((row) => {
        const currency = currencies.get(row.accountId)!;
        const convert = (amount: number) =>
          amount === 0 ? 0 : toEurCents(amount, fxOn(rates, currency, row.date));
        return {
          ...row,
          amountCents: convert(row.amountCents),
          feeCents: convert(row.feeCents),
          taxCents: convert(row.taxCents),
        };
      });
      const months = recordedComponents(converted, from, to);
      const income = months.reduce((sum, row) => sum + row.incomeCents, 0);
      const fees = months.reduce((sum, row) => sum + row.feesCents, 0);
      const taxes = months.reduce((sum, row) => sum + row.taxesCents, 0);
      const residual = recordedGainResidual(gainCents, income, fees, taxes);
      if (residual === null)
        throw new Error('Die Komponentensumme überschreitet den darstellbaren Bereich.');
      return { income, fees, taxes, residual, months };
    },
  });
  const error = accounts.error ?? query.error;
  const rows = query.data
    ? [
        { label: 'Kurs- und Bewertungseffekt', value: query.data.residual },
        { label: '+ Erträge brutto', value: query.data.income },
        { label: '− Gebühren', value: -query.data.fees },
        { label: '− Gebuchte Steuern', value: -query.data.taxes },
        { label: '= Gewinn im Zeitraum', value: gainCents },
      ]
    : [];
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)));
  return (
    <div className="portfolio-gain-components">
      {error ? (
        <ErrorNote
          what="Gewinnkomponenten"
          error={error}
          onRetry={() => void (accounts.isError ? accounts.refetch() : query.refetch())}
        />
      ) : !query.data ? (
        <LoadingNote what="Gewinnkomponenten" />
      ) : (
        <>
          <dl data-testid="portfolio-gain-components" className="gain-components">
            {rows.map((row) => (
              <div key={row.label}>
                <dt>{row.label}</dt>
                <dd>{eur(row.value, { sign: true })}</dd>
                <span
                  aria-hidden="true"
                  className="gain-component-bar"
                  style={{ width: `${(Math.abs(row.value) / max) * 100}%` }}
                />
              </div>
            ))}
          </dl>
          <p className="vnote">
            Kurs- und Bewertungseffekt als Restgröße · gebuchte Beträge im selben Zeitraum. TER ist
            bereits im Kurs enthalten.
          </p>
          <details>
            <summary>Komponenten, Zeitraum und Umrechnung</summary>
            <p className="vnote">
              {longDay(from)} bis {longDay(to)} · EUR. Kurs- und Bewertungseffekt = Restgröße aus
              dem Periodengewinn nach Abzug der gespeicherten Bruttoerträge und Hinzurechnung
              gebuchter Gebühren und Steuern; einschließlich Wechselkurseffekten. Keine separate
              Kursrendite. TER steckt bereits im Kurs. Fremdwährungen: gespeicherter Kurs am
              Zahlungstag oder letzter Kurs davor, jeder Betrag auf Cent gerundet.
            </p>
            <div
              className="rscroll"
              role="region"
              aria-label="Gebuchte Komponenten pro Monat"
              // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users scroll all recorded component columns.
              tabIndex={0}
            >
              <table className="rtable metrics-lead-table">
                <thead>
                  <tr>
                    <th scope="col">Monat</th>
                    <th scope="col">Erträge</th>
                    <th scope="col">Gebühren</th>
                    <th scope="col">Steuern</th>
                  </tr>
                </thead>
                <tbody>
                  {query.data.months.map((row) => (
                    <tr key={row.month}>
                      <th scope="row">{row.month}</th>
                      <td>{eur(row.incomeCents)}</td>
                      <td>{eur(row.feesCents)}</td>
                      <td>{eur(row.taxesCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
