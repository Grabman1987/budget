import { useQuery } from '@tanstack/react-query';
import { Button, useAmountPrivacy } from '@budget/ui';
import { request, queryString } from '../api/http';
import { accountsQuery, LEDGER_KEY } from '../ledger/queries';
import { longDay } from '../ledger/format';
import { EmptyNote, ErrorNote, LoadingNote } from '../ledger/states';
import { AppLink } from '../shell/app-link';
import { instrumentsQuery } from './portfolio-api';
import { moneyText, unitsText } from './portfolio-format';
import { TRADE_LABELS } from './trade-draft';
import { sourceMoney, type TradeRow } from './trade-api';
import { matchesAsset, type AssetType } from './redesign-filters';

export function WealthActivities({
  art,
  from,
  to,
  onEdit,
}: {
  art: AssetType;
  from?: string | undefined;
  to?: string | undefined;
  onEdit: (id: string, security: string) => void;
}) {
  useAmountPrivacy();
  const query = useQuery({
    queryKey: [...LEDGER_KEY, 'wealth-activities', from, to],
    enabled: !!to,
    retry: false,
    queryFn: () =>
      request<{ trades: TradeRow[] }>('GET', `/api/trades${queryString({ from, to })}`),
  });
  const instruments = useQuery(instrumentsQuery());
  const accounts = useQuery(accountsQuery());
  const rows = query.data?.trades.filter((row) => {
    const security = instruments.data?.securities.find((item) => item.id === row.securityId);
    return art === 'alle' || (!!security && matchesAsset(security.kind, art));
  });
  return (
    <section className="wealth-sheet" aria-label="Aktivitäten">
      <h2>Aktivitäten</h2>
      {[
        { query, what: 'Aktivitäten' },
        { query: instruments, what: 'Instrumente' },
        { query: accounts, what: 'Konten' },
      ].map(({ query: source, what }) => (
        <div key={what}>
          {source.isPending && <LoadingNote what={what} />}
          {source.isError && (
            <ErrorNote what={what} error={source.error} onRetry={() => void source.refetch()} />
          )}
        </div>
      ))}
      {rows?.length === 0 && <EmptyNote>Keine Handelsaktivitäten für diese Auswahl.</EmptyNote>}
      {!!rows?.length && (
        <ul className="wealth-action-list">
          {rows.map((row) => {
            const account = accounts.data?.accounts.find((item) => item.id === row.accountId);
            const instrument = instruments.data?.securities.find(
              (item) => item.id === row.securityId,
            );
            const money = (value: number) =>
              account ? sourceMoney(value, account.currency) : 'Währung nicht verfügbar';
            return (
              <li key={row.id}>
                <span>
                  <strong>
                    {TRADE_LABELS[row.kind]} · {instrument?.name ?? 'Instrument nicht verfügbar'}
                  </strong>
                  <br />
                  {longDay(row.date)} · {account?.name ?? 'Konto nicht verfügbar'}
                  <br />
                  {unitsText(Math.abs(row.unitsE8))} Stück · Brutto {money(row.amountCents)} ·
                  Gebühren {money(row.feeCents)} · Steuer {money(row.taxCents)}
                </span>
                <Button variant="ghost" onClick={() => onEdit(row.id, row.securityId)}>
                  Bearbeiten
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      <p className="vnote">
        Handel im gewählten Zeitraum. Einzahlungen, manuelle Werte und weitere Kontobewegungen
        bleiben im jeweiligen Kontoblatt erreichbar.
      </p>
    </section>
  );
}

/** Account-valued P2P/crypto remain reachable alongside security-valued positions. */
export function InvestmentAccounts({ art }: { art: AssetType }) {
  useAmountPrivacy();
  const query = useQuery(accountsQuery());
  const accounts = query.data?.accounts.filter(
    (account) =>
      ['crypto', 'p2p'].includes(account.type) &&
      (art === 'alle' ||
        (art === 'krypto' && account.type === 'crypto') ||
        (art === 'p2p' && account.type === 'p2p')),
  );
  return (
    <section className="wealth-sheet" aria-label="Krypto- und P2P-Konten">
      <h2>Krypto- und P2P-Konten</h2>
      {query.isPending && <LoadingNote what="Anlagekonten" />}
      {query.isError && (
        <ErrorNote what="Anlagekonten" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {accounts?.length === 0 && <EmptyNote>Keine passenden Krypto- oder P2P-Konten.</EmptyNote>}
      {!!accounts?.length && (
        <ul className="wealth-action-list">
          {accounts.map((account) => (
            <li key={account.id}>
              <span>
                <AppLink to={`/konten/${encodeURIComponent(account.id)}`}>{account.name}</AppLink>
                <br />
                Kontowert {moneyText(account.valueEurCents)} · Stand{' '}
                {account.lastValuedOn ? longDay(account.lastValuedOn) : longDay(query.data!.asOf)}
                {account.closedAt ? ' · geschlossen' : ''}
              </span>
              <AppLink
                to={`/konten/${encodeURIComponent(account.id)}`}
                search={{ pruefen: 'value' }}
              >
                Wert aktualisieren
              </AppLink>
            </li>
          ))}
        </ul>
      )}
      <p className="vnote">
        Ganze Kontowerte einschließlich Kassa; können bereits gelistete Instrumente enthalten. Keine
        zusätzliche Summe zum Portfolio.
      </p>
    </section>
  );
}
