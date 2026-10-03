import { useAmountPrivacy, Button } from '@budget/ui';
import { useQuery } from '@tanstack/react-query';
import { accountsQuery } from '../ledger/queries';
import { ErrorNote, LoadingNote } from '../ledger/states';
import { longDay } from '../ledger/format';
import { sourceMoney, tradesQuery } from './trade-api';
import { unitsText } from './portfolio-format';
import { TRADE_LABELS as KINDS } from './trade-draft';
export function TradeHistory({
  securityId,
  onEdit,
  disabled,
}: {
  securityId: string;
  onEdit: (id: string) => void;
  disabled: boolean;
}) {
  useAmountPrivacy();
  const query = useQuery(tradesQuery(securityId));
  const accounts = useQuery({ ...accountsQuery(), retry: false });
  return (
    <section className="trade-history" aria-labelledby="trade-history-title">
      <h3 id="trade-history-title">Handelsverlauf</h3>
      {query.isPending && <LoadingNote what="Handelsverlauf" />}
      {query.isError && (
        <ErrorNote what="Handelsverlauf" error={query.error} onRetry={() => void query.refetch()} />
      )}
      {accounts.isError && (
        <ErrorNote
          what="Anlagekonten"
          error={accounts.error}
          onRetry={() => void accounts.refetch()}
        />
      )}
      {query.data?.trades.length === 0 && (
        <p className="vnote">Noch kein Handel für dieses Instrument erfasst.</p>
      )}
      <ol className="trade-list">
        {query.data?.trades
          .slice()
          .reverse()
          .map((trade) => {
            const account = accounts.data?.accounts.find(
              (account) => account.id === trade.accountId,
            );
            const money = (cents: number) =>
              account ? sourceMoney(cents, account.currency) : 'Kontowährung wird geladen';
            return (
              <li key={trade.id} data-trade-id={trade.id}>
                <div>
                  <strong>{KINDS[trade.kind]}</strong> · {longDay(trade.date)}
                  <small>{account?.name ?? 'Konto wird geladen'}</small>
                </div>
                <dl>
                  <div>
                    <dt>Stück</dt>
                    <dd>
                      {unitsText(
                        trade.kind === 'buy' || trade.kind === 'sell'
                          ? Math.abs(trade.unitsE8)
                          : trade.unitsE8,
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Bruttobetrag</dt>
                    <dd>{money(trade.amountCents)}</dd>
                  </div>
                  <div>
                    <dt>Gebühren</dt>
                    <dd>{money(trade.feeCents)}</dd>
                  </div>
                  <div>
                    <dt>Einbehaltene Steuer</dt>
                    <dd>{money(trade.taxCents)}</dd>
                  </div>
                </dl>
                {trade.note && <p className="vnote">{trade.note}</p>}
                <Button
                  variant="ghost"
                  disabled={disabled}
                  onClick={() => onEdit(trade.id)}
                  aria-label={`${KINDS[trade.kind]} vom ${longDay(trade.date)} bearbeiten`}
                >
                  Bearbeiten
                </Button>
              </li>
            );
          })}
      </ol>
    </section>
  );
}
