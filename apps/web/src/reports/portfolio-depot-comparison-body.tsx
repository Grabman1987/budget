import type { DepotComparison, TradeRow } from '@budget/db';
import {
  feeBreakdownLast12Months,
  fxOn,
  sameDayMonthsBack,
  toEurCents,
  type RateTable,
} from '@budget/domain';
import { useQuery } from '@tanstack/react-query';
import { Button, privateAmount, useAmountPrivacy } from '@budget/ui';
import { useState } from 'react';
import { request, queryString } from '../api/http';
import { eur, longDay } from '../ledger/format';
import { accountsQuery, LEDGER_KEY } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import { percentText } from '../pages/portfolio-report-shared';

const privateRate = (value: number | null | undefined) =>
  value == null ? '–' : privateAmount(percentText(value, { sign: true }));

/** A dense side-by-side comparison; the existing full calculations/charts remain in the detail. */
export function PortfolioDepotComparisonBody({ data }: { data: DepotComparison }) {
  useAmountPrivacy();
  const [expanded, setExpanded] = useState(false);
  const accounts = useQuery(accountsQuery());
  const to = data.asOf;
  const from = sameDayMonthsBack(to, 12);
  const fees = useQuery({
    queryKey: [
      ...LEDGER_KEY,
      'depot-recorded-fees',
      from,
      to,
      data.depots.map((depot) => depot.accountId),
    ],
    enabled: accounts.isSuccess,
    retry: false,
    queryFn: async () => {
      const result = await request<{ trades: TradeRow[] }>(
        'GET',
        `/api/trades${queryString({ from, to })}`,
      );
      const currencies = new Map(
        accounts.data!.accounts.map((account) => [account.id, account.currency]),
      );
      const measuredAccounts = new Set(data.depots.map((depot) => depot.accountId));
      const source = result.trades.filter(
        (row) => row.date > from && row.date <= to && measuredAccounts.has(row.accountId),
      );
      const foreign = [...new Set(source.map((row) => currencies.get(row.accountId)))].filter(
        (currency): currency is string => !!currency && currency !== 'EUR',
      );
      const rates: RateTable = new Map(
        await Promise.all(
          foreign.map(async (currency) => {
            const result = await request<{ rates: { date: string; rateMicro: number }[] }>(
              'GET',
              `/api/fx${queryString({ currency, to })}`,
            );
            return [currency, result.rates] as const;
          }),
        ),
      );
      const converted = source.map((row) => {
        const currency = currencies.get(row.accountId);
        if (!currency) throw new Error('Für einzelne Gebühren fehlt die Kontowährung.');
        const convert = (value: number) =>
          value === 0 ? 0 : toEurCents(value, fxOn(rates, currency, row.date));
        return {
          ...row,
          amountCents: row.kind === 'fee' ? convert(row.amountCents) : 0,
          feeCents: convert(row.feeCents),
          taxCents: 0,
        };
      });
      const byAccount = new Map(
        accounts.data!.accounts.map((account) => [
          account.id,
          feeBreakdownLast12Months(
            converted.filter((row) => row.accountId === account.id),
            to,
          ).totalCents,
        ]),
      );
      if (![...byAccount.values()].every(Number.isSafeInteger))
        throw new Error('Gebührensumme nicht darstellbar.');
      return byAccount;
    },
  });
  const error = accounts.error ?? fees.error;
  const columns = [...data.depots, data.total!];
  const totalFees = fees.data
    ? data.depots.reduce((sum, depot) => sum + (fees.data.get(depot.accountId!) ?? 0), 0)
    : null;
  return (
    <section className="prep-card depot-summary" aria-labelledby="depot-summary-title">
      <h2 id="depot-summary-title">Depots im gleichen Zeitraum</h2>
      <p className="vnote">
        {longDay(data.window!.from)} bis {longDay(data.window!.to)} · EUR. Wertpapierdepots ohne
        Depotkassa; weitere Anlagen nach gespeicherten Werten und externen Flüssen.
      </p>
      <Button
        className="depot-summary-expand"
        variant="ghost"
        aria-expanded={expanded}
        aria-controls="depot-summary-table"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? 'Kompakte Depotliste' : 'Alle Vergleichswerte als Tabelle'}
      </Button>
      <div
        data-expanded={expanded}
        className="prep-scroll"
        role="region"
        aria-label="Depots im Vergleich, bei Bedarf horizontal verschiebbar"
        // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Keyboard users scroll all comparison columns.
        tabIndex={0}
      >
        <table className="prep-table" data-testid="depot-summary-table" id="depot-summary-table">
          <thead>
            <tr>
              <th scope="col">Depot</th>
              <th scope="col">Wert · EUR</th>
              <th scope="col">TTWROR</th>
              <th scope="col">XIRR p. a.</th>
              <th scope="col">Gebuchte Gebühren · 12 M</th>
              <th scope="col">Verlauf · Index 100</th>
            </tr>
          </thead>
          <tbody>
            {columns.map((depot) => (
              <tr key={depot.accountId ?? 'total'}>
                <th scope="row">
                  {depot.accountId ? (
                    <AppLink to={`/konten/${encodeURIComponent(depot.accountId)}`}>
                      {depot.name}
                    </AppLink>
                  ) : (
                    depot.name
                  )}
                  <small>{depot.platforms.join(', ')}</small>
                </th>
                <td className="n">
                  <span data-testid="depot-summary-value">{eur(depot.valueCents)}</span>
                  <span className="depot-mobile-return" aria-hidden="true">
                    TTWROR {privateRate(depot.performance?.ttwror)}
                  </span>
                </td>
                <td className="n">{privateRate(depot.performance?.ttwror)}</td>
                <td className="n">{privateRate(depot.performance?.xirr)}</td>
                <td className="n">
                  {fees.isSuccess && !accounts.isError
                    ? depot.accountId
                      ? eur(fees.data.get(depot.accountId) ?? 0)
                      : totalFees !== null && Number.isSafeInteger(totalFees)
                        ? eur(totalFees)
                        : 'Nicht darstellbar'
                    : error
                      ? 'Nicht verfügbar'
                      : 'Lädt …'}
                </td>
                <td>
                  <DepotSpark rows={depot.index} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {error && (
        <ErrorNote
          what="Gebuchte Depotgebühren"
          error={error}
          onRetry={() => void (accounts.isError ? accounts.refetch() : fees.refetch())}
        />
      )}
      {accounts.isPending && <LoadingNote what="Kontowährungen der Gebühren" />}
      <details>
        <summary>Gebührenfenster und Umrechnung</summary>
        <p className="vnote">
          Gebühren: tatsächlich gebuchte Trade- und Depotgebühren von {longDay(from)} bis{' '}
          {longDay(to)}, getrennt vom gewählten Renditezeitraum. Umrechnung mit gespeichertem
          Tageskurs oder letztem Kurs davor, pro Betrag auf Cent gerundet. TER wird je Depot nicht
          geschätzt; die vollständige Kosten-/TER-Auswertung steht unter{' '}
          <AppLink to="/reports/psteuern">Kosten, Steuern, Erträge</AppLink>.
        </p>
      </details>
      <p className="vnote">
        {data.benchmarks.length
          ? `Vergleich: ${data.benchmarks.map((benchmark) => `${benchmark.name} ${privateRate(benchmark.benchmarkReturn)}`).join(' · ')}`
          : 'Keine Benchmark gewählt.'}{' '}
        Kursindizes in EUR, ohne Ausschüttungen. Benchmark-Auswahl, Lücken, volle Zahlen und
        Tabellen im Detail.
      </p>
    </section>
  );
}

function DepotSpark({ rows }: { rows: { date: string; level: number | null }[] }) {
  const values = rows.flatMap((row) => (row.level === null ? [] : [row.level]));
  if (values.length < 2) return <span>Keine Historie</span>;
  const low = Math.min(...values),
    high = Math.max(...values),
    span = high - low || 1;
  const segments: string[][] = [[]];
  rows.forEach((row, index) => {
    if (row.level === null) segments.push([]);
    else
      segments
        .at(-1)!
        .push(
          `${(index / Math.max(1, rows.length - 1)) * 100},${28 - ((row.level - low) / span) * 24}`,
        );
  });
  return (
    <svg viewBox="0 0 100 32" width="100" height="32" aria-hidden="true">
      {segments
        .filter((segment) => segment.length > 1)
        .map((segment, index) => (
          <polyline
            key={index}
            points={segment.join(' ')}
            fill="none"
            stroke="var(--line)"
            strokeWidth="1.5"
          />
        ))}
    </svg>
  );
}
